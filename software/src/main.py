"""Generation probability (Pgen) scorer — a thin wrapper around OLGA.

Reads an input Parquet of clonotypes (columns: clonotypeKey, cdr3, v, j),
computes the generation probability of every CDR3 under the OLGA recombination
model implied by ``--species`` and ``--locus``, and writes:

- an output Parquet (clonotypeKey, pgen, neg_log_pgen), and
- a stats JSON with the count of clonotypes scored and excluded.

Design notes:

- Uses OLGA's Python API, never the ``olga-compute_pgen`` CLI: the CLI runs
  ``pip freeze`` at import and crashes in a pip-less runenv.
- The 10 calibrated models ship inside the vendored ``olga`` package
  (``olga/default_models/<name>/``); nothing is fetched at run time.
- ``neg_log_pgen`` is computed here, at the source: for ``pgen == 0`` it is the
  honest ``+Inf`` (a real extreme, not a fabricated ceiling), which round-trips
  through Parquet. Clamping for display is a plot-layer concern, not baked in.
- Non-scorable CDR3s are excluded and counted, never emitted as a misleading
  number. This filtering happens here in ``score()``: non-productive rows (the
  workflow passes the productive flag through as a column) and non-standard-
  alphabet rows are dropped, because OLGA silently mis-scores stop-codon /
  ambiguous sequences rather than failing.
- ``--locus IGLight`` covers single-cell light chains, whose column mixes kappa
  and lambda clonotypes. Each row is routed to the kappa or lambda model by its
  V-gene prefix (IGKV → kappa, IGLV → lambda); an indeterminate row is excluded.
"""

import argparse
import contextlib
import io
import json
import math
import os
import sys
import warnings

# OLGA 1.3.0 emits Python 3.12 SyntaxWarnings (unescaped regex/docstrings) at import,
# and its Pgen path prints "Unfamiliar gene" notes to stdout. Silence the warnings so
# stderr carries ONLY our progress output — then it needs no prefix to be parseable.
# Must precede the olga import.
warnings.filterwarnings("ignore", category=SyntaxWarning)

import olga  # noqa: E402
import olga.generation_probability as generation_probability  # noqa: E402
import olga.load_model as load_model  # noqa: E402
import polars as pl  # noqa: E402

STANDARD_AA = frozenset("ACDEFGHIKLMNPQRSTVWY")


def report_progress(done, total):
    # A bare 0..1 fraction on stderr. stderr is entirely ours (OLGA's stdout noise is
    # redirected, its warnings silenced), so no prefix is needed: the model reads the
    # latest line via getProgressLog and app.ts feeds it to the progress strip.
    if total > 0:
        print(f"{done / total:.4f}", file=sys.stderr, flush=True)

# (species, locus) → OLGA default-model directory name. IGLight is not a direct
# model — it is resolved per row (see model_name_for_row).
MODEL_BY_LOCUS = {
    "IGH": "{species}_B_heavy",
    "IGK": "{species}_B_kappa",
    "IGL": "{species}_B_lambda",
    "TRB": "{species}_T_beta",
    "TRA": "{species}_T_alpha",
}


def default_models_root():
    return os.path.join(os.path.dirname(olga.__file__), "default_models")


def is_vdj(model_name):
    """Heavy (IGH) and beta (TRB) recombine with a D segment → VDJ model;
    kappa / lambda / alpha have no D → VJ model."""
    return "heavy" in model_name or "beta" in model_name


def load_pgen_model(model_name):
    model_folder = os.path.join(default_models_root(), model_name)
    if not os.path.isdir(model_folder):
        sys.exit(f"OLGA model not found: {model_name} (looked in {model_folder})")

    params_file = os.path.join(model_folder, "model_params.txt")
    marginals_file = os.path.join(model_folder, "model_marginals.txt")
    v_anchors = os.path.join(model_folder, "V_gene_CDR3_anchors.csv")
    j_anchors = os.path.join(model_folder, "J_gene_CDR3_anchors.csv")

    if is_vdj(model_name):
        genomic_data = load_model.GenomicDataVDJ()
        genomic_data.load_igor_genomic_data(params_file, v_anchors, j_anchors)
        generative_model = load_model.GenerativeModelVDJ()
        generative_model.load_and_process_igor_model(marginals_file)
        model = generation_probability.GenerationProbabilityVDJ(generative_model, genomic_data)
    else:
        genomic_data = load_model.GenomicDataVJ()
        genomic_data.load_igor_genomic_data(params_file, v_anchors, j_anchors)
        generative_model = load_model.GenerativeModelVJ()
        generative_model.load_and_process_igor_model(marginals_file)
        model = generation_probability.GenerationProbabilityVJ(generative_model, genomic_data)

    # Wrap in OLGA's numba-JIT FastPgen — same compute_aa_CDR3_pgen API, ~10x faster
    # per CDR3 (the standard path is interpreted numpy DP). numba ships in the runenv
    # (olga's declared dep). Imported lazily so main.py stays importable where numba
    # is absent. First call JIT-compiles (a few seconds), then reused via the cache.
    from olga.performance.fast_pgen import FastPgen

    return FastPgen(model)


def model_name_for_row(species, locus, v_gene):
    """The OLGA model directory for one row, or None when it cannot be resolved.

    All loci but IGLight map directly. IGLight (single-cell light) is routed to
    kappa or lambda by the V-gene prefix, since the light column mixes both.
    """
    if locus != "IGLight":
        return MODEL_BY_LOCUS[locus].format(species=species)
    if v_gene and v_gene.upper().startswith("IGK"):
        return f"{species}_B_kappa"
    if v_gene and v_gene.upper().startswith("IGL"):
        return f"{species}_B_lambda"
    return None


def is_scorable(cdr3):
    return bool(cdr3) and all(residue in STANDARD_AA for residue in cdr3)


def neg_log10(pgen):
    return math.inf if pgen == 0.0 else -math.log10(pgen)


def is_productive(flag):
    # MiXCR's -isProductive exports "true"/"false"; be lenient on casing.
    return flag is None or str(flag).strip().lower() == "true"


def score(df, species, locus):
    """Score each row, returning (kept_keys, pgens, neg_logs, excluded_count).

    ``excluded`` counts only clonotypes that were present for this chain but
    could not be scored honestly — non-productive, non-standard-alphabet,
    compute failures, or (light) indeterminate kappa/lambda. A clonotype that
    simply lacks this chain (null/empty CDR3) is skipped WITHOUT counting: it is
    a scoping absence, not a failure (see spec failure-handling).

    Models are loaded lazily and cached by name, so IGLight loads at most the
    kappa and lambda models once each. Row order is preserved from the input
    (which the workflow supplies canonically), so the output is deterministic for
    pure-template dedup.
    """
    keys_in = df.get_column("clonotypeKey").to_list()
    cdr3s = df.get_column("cdr3").to_list()
    height = df.height
    vs = df.get_column("v").to_list() if "v" in df.columns else [None] * height
    js = df.get_column("j").to_list() if "j" in df.columns else [None] * height
    productive = df.get_column("productive").to_list() if "productive" in df.columns else [None] * height

    keys, pgens, neg_logs = [], [], []
    excluded = 0
    model_cache = {}

    step = max(1, height // 100)  # emit progress ~every 1%

    for i, (key, cdr3, v_gene, j_gene, prod) in enumerate(zip(keys_in, cdr3s, vs, js, productive)):
        if i % step == 0:
            report_progress(i, height)
        cdr3 = cdr3.strip() if isinstance(cdr3, str) else cdr3
        v_gene = v_gene or None
        j_gene = j_gene or None
        if not cdr3:
            continue  # no CDR3 for this chain — scoping absence, not a failure
        if not is_productive(prod) or not is_scorable(cdr3):
            excluded += 1
            continue
        model_name = model_name_for_row(species, locus, v_gene)
        if model_name is None:
            # Light chain whose kappa/lambda cannot be told from the V gene.
            excluded += 1
            continue
        pgen_model = model_cache.get(model_name)
        if pgen_model is None:
            pgen_model = load_pgen_model(model_name)
            model_cache[model_name] = pgen_model
        # Allele-less MiXCR gene names (e.g. IGHV1-2) match OLGA at gene level for
        # human; unrecognized names (all mouse names, unknown human) trigger OLGA's
        # silent no-anchor fallback rather than an error.
        try:
            pgen = pgen_model.compute_aa_CDR3_pgen(cdr3, v_gene, j_gene)
        except Exception:  # noqa: BLE001 — one bad row must not sink the batch; counted below
            excluded += 1
            continue
        keys.append(key)
        pgens.append(float(pgen))
        neg_logs.append(neg_log10(pgen))

    report_progress(height, height)
    return keys, pgens, neg_logs, excluded


def main(argv):
    parser = argparse.ArgumentParser(prog="generation-probability")
    parser.add_argument("input", help="input parquet: clonotypeKey, cdr3, v, j")
    parser.add_argument("output", help="output parquet: clonotypeKey, pgen, neg_log_pgen")
    parser.add_argument("stats", help="output stats json: {scored, excluded}")
    parser.add_argument("--species", required=True, choices=["human", "mouse"])
    parser.add_argument(
        "--locus", required=True, choices=["IGH", "IGK", "IGL", "TRB", "TRA", "IGLight"]
    )
    args = parser.parse_args(argv)

    df = pl.read_parquet(args.input)
    # OLGA prints an "Unfamiliar V/J gene … using default mask" line per row to
    # stdout whenever a gene name isn't in the model's anchor table (i.e. every
    # mouse clonotype — mouse Pgen is aa-only). That is tens of thousands of lines
    # of noise that also throttles the run on I/O, so silence OLGA's stdout while
    # scoring. Real problems still surface: skip messages go to stderr, and model
    # load failures sys.exit (stderr).
    with contextlib.redirect_stdout(io.StringIO()):
        keys, pgens, neg_logs, excluded = score(df, args.species, args.locus)

    key_dtype = df.get_column("clonotypeKey").dtype
    out = pl.DataFrame(
        {
            "clonotypeKey": pl.Series("clonotypeKey", keys, dtype=key_dtype),
            "pgen": pl.Series("pgen", pgens, dtype=pl.Float64),
            "neg_log_pgen": pl.Series("neg_log_pgen", neg_logs, dtype=pl.Float64),
        }
    )
    out.write_parquet(args.output)

    with open(args.stats, "w") as handle:
        json.dump({"scored": len(keys), "excluded": excluded}, handle, sort_keys=True, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1:])
