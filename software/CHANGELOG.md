# @platforma-open/milaboratories.generation-probability.software

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
