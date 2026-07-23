# Overview

For every clonotype in a repertoire, this block computes the chance that V(D)J recombination would build its exact CDR3 by chance, before any immune selection — a value called its generation probability (Pgen). Some CDR3s form readily through many recombination paths (high Pgen); others sit far from the sequences recombination favors and are rare (low Pgen). Pgen spans about twenty orders of magnitude across a repertoire, so it ranks clonotypes on a scale that V/J gene usage and clone abundance cannot.

What a rare CDR3 means depends on your data. In post-immunisation antibody (BCR) repertoires, a rare heavy-chain CDR3 has drifted far from germline through affinity maturation, so Pgen ranks lead candidates by that distance. T-cell (TCR) repertoires undergo no somatic hypermutation, so there Pgen instead separates common public CDR3s — shared across people by chance — from rare, clonally expanded ones.

Each clonotype carries the raw Pgen and its −log10 form, where a higher −log10 marks a rarer CDR3, computed on its primary chain. These values feed downstream ranking blocks such as Lead Selection.

# Method

Pgen is computed with [OLGA](https://github.com/statbiophys/OLGA) v1.3.0, which sums over the V(D)J recombination paths that yield each CDR3 under a learned model. Calibrated models cover human and mouse across IGH / IGK / IGL / TRA / TRB. On anything else — another species such as camelid, or sequences with no true V(D)J origin such as display libraries and synthetic sets — OLGA still returns a number, but one with no biological meaning. OLGA is distributed under GPL-3.0.

> Sethna Z, Elhanati Y, Callan CG Jr, Walczak AM, Mora T. OLGA: fast computation of generation probabilities of B- and T-cell receptor amino acid sequences and motifs. _Bioinformatics_ 35(17):2974–2981, 2019. [doi:10.1093/bioinformatics/btz035](https://doi.org/10.1093/bioinformatics/btz035)
