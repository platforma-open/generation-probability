# @platforma-open/milaboratories.generation-probability.software

## 1.0.2

### Patch Changes

- 13fb256: Fix the block on a backend without Docker, such as the built-in backend.

  - Run the scorer in the `3.12.10-pgen` Python run environment. The backend installs the Python packages offline from the run environment. The base run environment did not have the pinned `llvmlite`, `numba`, and `numpy` versions.
  - Fall back to `spawn` worker processes when `forkserver` cannot start. Windows has no `forkserver`. On Linux and macOS, the `forkserver` socket path in a deep work directory can be longer than the system limit. In all other cases the block uses `forkserver` as before.

## 1.0.1

### Patch Changes

- c8f09a8: Migrate onto the structurer and take the full SDK upgrade (block-tools 2.14.3, tengo-builder 4.0.23, model 1.83.0, ui-vue 1.83.3).

  Adds the mandatory block kind. Its init-params contract is the input dataset plus the species, so a project template can seed a configured Generation Probability block.

## 1.0.0

### Major Changes

- 1026dfe: Initial release.

  - Per-clonotype generation probability (Pgen) via OLGA on BCR and TCR
    repertoires from MiXCR clonotyping.
  - Human and mouse models for IGH, IGK, IGL, TRA, and TRB; recombination
    model resolved from dataset species and per-chain locus metadata.
  - Emits raw Pgen and -log10(Pgen) per chain (heavy/light for BCR,
    beta/alpha for TCR).
