import multiprocessing
import os
import sys
import threading
from argparse import ArgumentParser
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from enum import Enum
from functools import cache, partial
from pathlib import Path

import polars as pl
from olga import generation_probability, load_model
from olga.performance.fast_pgen import FastPgen


class Alphabet(Enum):
    AMINO_ACID = "aminoacid"
    NUCLEOTIDE = "nucleotide"


class Species(Enum):
    HUMAN = "human"
    MOUSE = "mouse"


class Recombination(Enum):
    VDJ = "VDJ"
    VJ = "VJ"


CHAIN_MODELS = {
    "IGH": ("B_heavy", Recombination.VDJ),
    "IGK": ("B_kappa", Recombination.VJ),
    "IGL": ("B_lambda", Recombination.VJ),
    "TRB": ("T_beta", Recombination.VDJ),
    "TRA": ("T_alpha", Recombination.VJ),
}


@dataclass(frozen=True, slots=True)
class Args:
    input: Path
    output: Path
    species: Species
    alphabet: Alphabet
    key_column: str
    sequence_columns: list[str]
    chain_columns: list[str]
    pgen_columns: list[str]
    neg_log_pgen_columns: list[str]
    workers: int


@cache
def get_model(chain: str, species: Species) -> FastPgen | None:
    try:
        name, recombination = CHAIN_MODELS[chain]
    except KeyError:
        return None
    base = (
        Path(load_model.__file__).parent / "default_models" / f"{species.value}_{name}"
    )
    match recombination:
        case Recombination.VDJ:
            genomic = load_model.GenomicDataVDJ()
            generative = load_model.GenerativeModelVDJ()
            model_init = generation_probability.GenerationProbabilityVDJ
        case Recombination.VJ:
            genomic = load_model.GenomicDataVJ()
            generative = load_model.GenerativeModelVJ()
            model_init = generation_probability.GenerationProbabilityVJ
    genomic.load_igor_genomic_data(
        base / "model_params.txt",
        base / "V_gene_CDR3_anchors.csv",
        base / "J_gene_CDR3_anchors.csv",
    )
    generative.load_and_process_igor_model(base / "model_marginals.txt")
    return FastPgen(model_init(generative, genomic))


def compute_pgen(
    sequence: str,
    chain: str,
    alphabet: Alphabet,
    species: Species,
) -> float | None:
    model = get_model(chain, species)
    if not model:
        return None
    match alphabet:
        case Alphabet.AMINO_ACID:
            compute = model.compute_aa_CDR3_pgen
        case Alphabet.NUCLEOTIDE:
            compute = model.compute_nt_CDR3_pgen
    return compute(sequence, print_warnings=False)


def parse_args() -> Args:
    parser = ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--species", required=True, type=Species)
    parser.add_argument("--alphabet", required=True, type=Alphabet)
    parser.add_argument("--key-column", required=True)
    parser.add_argument(
        "--sequence-column",
        required=True,
        action="append",
        dest="sequence_columns",
    )
    parser.add_argument(
        "--chain-column",
        required=True,
        action="append",
        dest="chain_columns",
        help="column holding each row's locus, or =LOCUS for a unit with a constant locus",
    )
    parser.add_argument(
        "--pgen-column",
        required=True,
        action="append",
        dest="pgen_columns",
    )
    parser.add_argument(
        "--neg-log-pgen-column",
        required=True,
        action="append",
        dest="neg_log_pgen_columns",
    )
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 1)
    return Args(**vars(parser.parse_args()))


def resolve_chain_literals(df: pl.LazyFrame, chain_args: list[str]) -> tuple[pl.LazyFrame, list[str]]:
    """Materialise `=LOCUS` chain arguments as constant columns.

    A dataset whose locus is a property of the whole unit rather than of each row -- an
    imported receptor set, which carries no per-record `pl7.app/vdj/chain` column -- passes
    `=IGH` instead of a column name. Adding it as a real column here keeps every step
    downstream (group_by, join, the unsupported-chain report) working unchanged.
    """
    literals: dict[str, str] = {}
    resolved: list[str] = []
    for index, argument in enumerate(chain_args):
        if not argument.startswith("="):
            resolved.append(argument)
            continue
        name = f"_chain_literal_{index}"
        literals[name] = argument[1:]
        resolved.append(name)
    if literals:
        df = df.with_columns([pl.lit(v).alias(k) for k, v in literals.items()])
    return df, resolved


def main() -> None:
    args = parse_args()
    df = pl.scan_parquet(args.input)
    # Args is frozen, so the resolved names travel as a local.
    df, chain_columns = resolve_chain_literals(df, args.chain_columns)

    columns = set(df.collect_schema().names())
    missing_columns = {
        args.key_column,
        *args.sequence_columns,
        *chain_columns,
    } - columns
    if missing_columns:
        msg = f"columns not found in {args.input}: {missing_columns}"
        raise SystemExit(msg)
    if args.workers < 1:
        msg = f"--workers must be >= 1, got {args.workers}"
        raise SystemExit(msg)
    if len(args.sequence_columns) != len(chain_columns):
        msg = (
            "number of sequence columns and chain columns do not match "
            f"({len(args.sequence_columns)} ≠ {len(chain_columns)})"
        )
        raise SystemExit(msg)

    total = df.select(pl.len()).collect().item() * len(args.sequence_columns)
    supported_chains = set(CHAIN_MODELS)

    score = partial(compute_pgen, alphabet=args.alphabet, species=args.species)

    progress_lock = threading.Lock()
    done = 0
    skipped_chains: set[str] = set()

    with ProcessPoolExecutor(
        max_workers=args.workers,
        mp_context=multiprocessing.get_context("forkserver"),
    ) as pool:

        def process_batch(batch: pl.Series) -> pl.Series:
            nonlocal done
            chains = batch.struct.field("chain")
            result = pl.Series(
                pool.map(
                    score,
                    batch.struct.field("sequence"),
                    chains,
                    chunksize=len(batch) // args.workers or 1,
                ),
            )
            with progress_lock:
                done += int(batch.struct.field("multiplicity").sum())
                skipped_chains.update(
                    chain
                    for chain in chains
                    if chain is not None and chain not in supported_chains
                )
                progress = min(1, done / total if total else 1)
            print(f"progress: {progress:.3f}", file=sys.stderr)
            return result

        res = df

        for sequence, chain, pgen, neg_log_pgen in zip(
            args.sequence_columns,
            chain_columns,
            args.pgen_columns,
            args.neg_log_pgen_columns,
            strict=True,
        ):
            multiplicity = "multiplicity"
            while multiplicity in (sequence, chain):
                multiplicity = "_" + multiplicity
            distinct = (
                df.select(sequence, chain)
                .drop_nulls()
                .group_by(sequence, chain)
                .len(name=multiplicity)
            )
            pgen_col = (
                pl.struct(sequence=sequence, chain=chain, multiplicity=multiplicity)
                .map_batches(
                    process_batch,
                    return_dtype=pl.Float64,
                    is_elementwise=True,
                )
                .alias(pgen)
            )
            scored = (
                distinct.with_columns(pgen_col)
                .with_columns(-pl.col(pgen).log10().alias(neg_log_pgen))
                .select(sequence, chain, pgen, neg_log_pgen)
            )
            res = res.join(scored, on=(sequence, chain), how="left")

        res.select(
            args.key_column,
            *args.pgen_columns,
            *args.neg_log_pgen_columns,
        ).sink_parquet(args.output, engine="streaming")

    if skipped_chains:
        print(f"skipped: {','.join(sorted(skipped_chains))}", file=sys.stderr)


if __name__ == "__main__":
    main()
