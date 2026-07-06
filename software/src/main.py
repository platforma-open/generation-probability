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
def get_model(chain: str, species: Species) -> FastPgen:
    name, recombination = CHAIN_MODELS[chain]
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
) -> float:
    model = get_model(chain, species)
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


def main() -> None:
    args = parse_args()
    df = pl.scan_parquet(args.input)

    columns = set(df.collect_schema().names())
    missing_columns = {
        args.key_column,
        *args.sequence_columns,
        *args.chain_columns,
    } - columns
    if missing_columns:
        msg = f"columns not found in {args.input}: {missing_columns}"
        raise SystemExit(msg)
    if args.workers < 1:
        msg = f"--workers must be >= 1, got {args.workers}"
        raise SystemExit(msg)
    if len(args.sequence_columns) != len(args.chain_columns):
        msg = (
            "number of sequence columns and chain columns do not match "
            f"({len(args.sequence_columns)} ≠ {len(args.chain_columns)})"
        )
        raise SystemExit(msg)

    total = (
        df.select(
            pl.struct(sequence, chain).hash().approx_n_unique()
            for sequence, chain in zip(
                args.sequence_columns,
                args.chain_columns,
                strict=True,
            )
        )
        .collect()
        .sum_horizontal()
        .item()
    )

    score = partial(compute_pgen, alphabet=args.alphabet, species=args.species)

    progress_lock = threading.Lock()
    done = 0

    def advance_progress(n: int) -> None:
        nonlocal done
        with progress_lock:
            done += n
        print(f"progress: {min(1, done / total if total else 1):.3f}", file=sys.stderr)

    with ProcessPoolExecutor(
        max_workers=args.workers,
        mp_context=multiprocessing.get_context("forkserver"),
    ) as pool:

        def process_batch(batch: pl.Series) -> pl.Series:
            batch_len = len(batch)
            res = pl.Series(
                pool.map(
                    score,
                    batch.struct.field("sequence"),
                    batch.struct.field("chain"),
                    chunksize=batch_len // args.workers or 1,
                ),
            )
            advance_progress(batch_len)
            return res

        res = df

        for sequence, chain, pgen, neg_log_pgen in zip(
            args.sequence_columns,
            args.chain_columns,
            args.pgen_columns,
            args.neg_log_pgen_columns,
            strict=True,
        ):
            pgen_col = (
                pl.struct(sequence=sequence, chain=chain)
                .map_batches(
                    process_batch,
                    return_dtype=pl.Float64,
                    is_elementwise=True,
                )
                .alias(pgen)
            )
            res = res.join(
                df.select(sequence, chain)
                .drop_nulls()
                .unique()
                .with_columns(pgen_col)
                .with_columns(-pl.col(pgen).log10().alias(neg_log_pgen)),
                on=(sequence, chain),
                how="left",
            )

        res.select(
            args.key_column,
            *args.pgen_columns,
            *args.neg_log_pgen_columns,
        ).sink_parquet(args.output, engine="streaming")


if __name__ == "__main__":
    main()
