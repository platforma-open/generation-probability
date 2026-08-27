---
'@platforma-open/milaboratories.generation-probability.workflow': patch
'@platforma-open/milaboratories.generation-probability': patch
---

Fix swapped chain labels on single-cell TCR datasets

The A/B slot was mapped to a chain name twice, and the two disagreed. MiXCR fixes "A" as the
more diverse chain — the one that recombines a D segment — so a receptor's chain order is
TCRBeta/TCRAlpha and TCRDelta/TCRGamma, not alphabetical. The label table read A as Alpha and
B as Beta, so on a single-cell TCR alpha/beta dataset the alpha column was labelled
"Generation probability (Beta)" and the beta column "(Alpha)". Gamma/delta was swapped the
same way.

The Pgen values themselves were always right: the locus came from the per-record
`pl7.app/vdj/chain` column, never from the A/B letter. Only the label was wrong — but a
mislabelled column is read as the wrong chain's result.

Labels are now derived from the chain that the A/B slot resolves to, through the single table
that also decides the locus, so a label cannot disagree with the model that produced the value
beside it. The duplicate label table is gone, which is what allowed the two to drift apart.

Single-cell IG datasets, bulk and imported sets are unaffected.
