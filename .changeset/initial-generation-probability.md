---
'@platforma-open/milaboratories.generation-probability': minor
'@platforma-open/milaboratories.generation-probability.workflow': minor
'@platforma-open/milaboratories.generation-probability.model': minor
'@platforma-open/milaboratories.generation-probability.ui': minor
'@platforma-open/milaboratories.generation-probability.software': minor
---

Initial Generation Probability (Pgen) block. Wraps OLGA to compute per-clonotype
generation probability and -log10(Pgen) for BCR/TCR CDR3s on the clonotype axis.
Scores both chains of the primary receptor (single-cell heavy + light); secondary
receptors are not scored in v1 (MiXCR exports no V gene for secondary, so a light
secondary cannot be routed to the correct kappa/lambda model). The OLGA model is
chosen automatically from the selected species and each chain's locus (light
chains route kappa/lambda per row by V gene). Runs on a dedicated Python runenv
(runenv-python-3:3.12.10-pgen) that bundles OLGA and its recombination models.
