# @platforma-open/milaboratories.generation-probability.model

## 1.1.0

### Minor Changes

- 5be7d5d: Score imported receptor sets, and fix swapped chain labels on single-cell TCR data

  **Imported receptor sets.** A set from Import VDJ Data was offered nowhere and scored nothing.
  Four separate things stopped it, each failing differently.

  The dataset dropdown filtered on the presence of a per-record `pl7.app/vdj/chain` column, which
  an imported set does not have — so it never appeared as an option at all. Its locus is a property
  of the whole set, recorded on the key axis, and that is now accepted as an alternative.

  The CDR3 alphabet was read from `pl7.app/alphabet` on the key axis or from a `<key>/structure`
  domain key. An imported set states it in neither — the structure key belongs to the
  `scClonotypeKey` vocabulary its axis does not use — so the run died on "Cannot determine CDR3
  alphabet". Its sequence columns do carry the alphabet, so that is where it is now read from when
  the axis says nothing. The axis stays authoritative when it does say something: a MiXCR set emits
  both nucleotide and amino-acid CDR3 columns, and the axis is what says which of them defines the
  clonotype.

  Scoring needed a per-row locus column and quietly produced an empty result without one. The
  scorer's input table is now assembled in a single pass that appends a constant locus column for a
  unit whose locus is the same for every row, so the scoring script is unchanged and still simply
  reads a locus per row.

  Whether the two chains are scored separately followed the key axis being
  `pl7.app/vdj/scClonotypeKey`. A paired imported set carries both chains in one frame under the
  `pl7.app/vdj/scClonotypeChain` column domain on a `variantKey` axis, so it took the bulk path,
  where the first CDR3 column found is scored and the other chain is silently dropped. That now
  follows the column domain.

  **A light chain from an imported set is reported as skipped, not scored.** OLGA needs IGK and IGL
  as separate models and an imported set records only "IG Light", so the locus is genuinely unknown.
  Rather than guess, the light unit keeps its chain name, gets no Pgen, and is named in the block's
  existing skipped-chains banner. Heavy chains (IGH) and TCR alpha/beta (TRA, TRB) score normally.

  **Swapped chain labels.** MiXCR fixes "A" as the more diverse chain — the one that recombines a D
  segment — so a receptor's chain order is TCRBeta/TCRAlpha and TCRDelta/TCRGamma, not alphabetical.
  The label table read A as Alpha and B as Beta, so on a single-cell TCR alpha/beta dataset the alpha
  column was labelled "Generation probability (Beta)" and the beta column "(Alpha)". Gamma/delta was
  swapped the same way. The Pgen values were always right — the locus came from the per-record chain
  column, never from the A/B letter — but a mislabelled column reads as the wrong chain's result.
  Labels are now derived from the chain that the A/B slot resolves to, through the single table that
  also decides the locus, so a label cannot disagree with the model that produced the value beside it.

  Bulk, single-cell IG, peptide and amplicon inputs are unaffected.

## 1.0.0

### Major Changes

- 1026dfe: Initial release.

  - Per-clonotype generation probability (Pgen) via OLGA on BCR and TCR
    repertoires from MiXCR clonotyping.
  - Human and mouse models for IGH, IGK, IGL, TRA, and TRB; recombination
    model resolved from dataset species and per-chain locus metadata.
  - Emits raw Pgen and -log10(Pgen) per chain (heavy/light for BCR,
    beta/alpha for TCR).
