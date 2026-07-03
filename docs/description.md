# Generation Probability

Computes the **generation probability (Pgen)** of BCR/TCR CDR3s using
[OLGA](https://github.com/statbiophys/OLGA) — the probability that random V(D)J
recombination would produce a given CDR3 by chance.

A very low Pgen means the sequence is far from the germline starting point, one
of the most informative single-sequence properties a CDR3 has:

- **Antibodies (BCR):** drift from germline tracks affinity maturation — the
  rarest CDR3s tend to be the most matured, highest-affinity clones, making Pgen
  a ranking signal for lead selection.
- **T-cells (TCR):** the same number separates common, publicly-generated
  clonotypes (high Pgen) from rare, privately-generated ones (low Pgen).

For each scored chain the block adds two columns on the clonotype axis: the raw
`Pgen` and its `-log10(Pgen)` (the usable, sortable ranking form; higher = rarer).

**Applies to** real V(D)J-derived BCR and TCR repertoires (human and mouse,
single-cell and bulk) for which OLGA ships a calibrated model. It is not
meaningful for camelid VHH, display-library (phage/yeast) or synthetic
sequences, which are not offered.

Select an upstream MiXCR clonotyping dataset and the species; the recombination
model is chosen automatically from the species and each chain's locus.
