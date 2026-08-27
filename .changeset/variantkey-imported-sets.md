---
'@platforma-open/milaboratories.generation-probability.workflow': minor
'@platforma-open/milaboratories.generation-probability.model': minor
'@platforma-open/milaboratories.generation-probability.block': minor
---

Score imported receptor sets keyed on pl7.app/variantKey

An imported set from Import VDJ Data was offered nowhere and scored nothing. Four separate
things stopped it, each failing differently:

The dataset dropdown filtered on the presence of a per-record `pl7.app/vdj/chain` column, which
an imported set does not have — so it never appeared as an option at all. Its locus is a property
of the whole set, recorded on the key axis, and that is now accepted as an alternative.

The CDR3 alphabet was read from `pl7.app/alphabet` on the key axis or from a `<key>/structure`
domain key. An imported set carries neither — the structure key belongs to the `scClonotypeKey`
vocabulary its axis does not use — so the run died on "Cannot determine CDR3 alphabet". Such a
set is amino acid throughout, which is now the answer.

Scoring needed a per-row locus column and quietly produced an empty result without one. A unit
whose locus is constant now gets that column added by a `pt` step over the built table, so the
scoring script is unchanged and still simply reads a locus per row. The step runs only when a
constant is actually needed, so bulk and single-cell inputs keep the graph they had.

Whether the two chains are scored separately followed the key axis being
`pl7.app/vdj/scClonotypeKey`. A paired imported set carries both chains in one frame under the
`pl7.app/vdj/scClonotypeChain` column domain on a `variantKey` axis, so it took the bulk path,
where the first CDR3 column found is scored and the other chain is silently dropped. That now
follows the column domain.

**A light chain from an imported set is reported as skipped, not scored.** OLGA needs IGK and IGL
as separate models and an imported set records only "IG Light", so the locus is genuinely unknown.
Rather than guess, the light unit is passed through as `IGLight`, gets no Pgen, and is named in
the block's existing skipped-chains message. Heavy chains (IGH) and TCR alpha/beta (TRA, TRB) are
scored normally.

Bulk, single-cell, peptide and amplicon inputs are unaffected.
