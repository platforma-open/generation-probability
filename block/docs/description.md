# Overview

Computes the **generation probability** (Pgen) of each clonotype's CDR3 on BCR and TCR repertoires. Pgen is the probability that the V(D)J recombination machinery produces a given CDR3, summed over every recombination path that yields that sequence under a learned recombination model. It is one of the most informative properties of a CDR3 read from a single sequence: the metric spans roughly twenty orders of magnitude in real repertoires and carries continuous information about how far a CDR3 has drifted from its germline starting point.

For each clonotype the block emits a raw **Pgen** column and its **-log10(Pgen)** form. Higher `-log10(Pgen)` means a rarer CDR3, further from the germline. Both forms are provided so downstream consumers do not have to back-transform values near the lower bound of Pgen, where numerical precision matters. Values are emitted per chain — heavy and light for BCR, beta and alpha for TCR — with the primary chain (heavy / beta) as the main signal and the secondary chain (light / alpha) reported when paired-chain data is present.

The biological reading depends on the dataset. In post-immunisation BCR data, a rarer heavy-chain CDR3 correlates with affinity maturation, making Pgen a germline-distance signal for lead ranking. In TCR data, T-cells do not undergo somatic hypermutation, so the reading is clonal rarity — separating public, common-by-chance clonotypes from rare, clonally expanded ones. The outputs are intended for direct use in lead-selection ranking and as a continuous covariate for downstream scoring blocks.

# Method

The block wraps [OLGA](https://github.com/statbiophys/OLGA), which computes Pgen of an amino-acid CDR3 by summing over all V(D)J recombination paths that translate to that sequence under a learned recombination model. The recombination model is resolved automatically from the dataset's species and per-chain locus metadata (human or mouse × IGH / IGK / IGL / TRA / TRB); it is not a user-facing parameter. The computation is per-CDR3 and independent across clonotypes.

> Sethna et al. OLGA: fast computation of generation probabilities of B- and T-cell receptor amino acid sequences and motifs. _Bioinformatics_ 35(17):2974–2981, 2019. [doi:10.1093/bioinformatics/btz035](https://doi.org/10.1093/bioinformatics/btz035)

# Scope

Pgen is well-defined on any V(D)J-derived CDR3 for which a calibrated OLGA model exists. This block applies to **BCR** (human or mouse; IGH, IGK, IGL) and **TCR** (human or mouse; TRA, TRB) repertoires produced by MiXCR clonotyping.

It is **not applicable** to camelid VHH (no camelid model in the standard OLGA distribution — human and mouse IGH parameters do not transfer), to scFv or display-library inputs (phage, yeast), to panning-enriched repertoires, or to synthetic sequence sets without a real V(D)J origin. OLGA may still emit numbers on such inputs, but those numbers would not carry the biological meaning this block exists to provide.

# License

OLGA is distributed under the GPL-3.0 license.
