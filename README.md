# Generation Probability

Score how likely V(D)J recombination was to produce each receptor by chance. This Platforma block computes the generation probability (Pgen) of every BCR or TCR clonotype using OLGA — a measure of clonal rarity and germline distance that separates receptors the recombination machinery makes readily from those it almost never produces.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

## What it does

Not all receptors are equally likely to exist. V(D)J recombination has strong biases: some CDR3s are produced constantly across individuals by chance alone, others require an improbable combination of gene choices and junctional edits. Pgen quantifies that — the probability the recombination process generates a given CDR3, computed from a statistical model of recombination rather than from your data.

That single number carries two useful signals. As **clonal rarity**, a low Pgen means the receptor is unlikely to have arisen by chance, so finding it at appreciable frequency suggests it was selected rather than generated repeatedly. As **germline distance**, Pgen tracks how far a sequence sits from what recombination produces by default.

The block computes Pgen with OLGA, using the recombination model matched to each chain — heavy, kappa, and lambda for BCR; alpha and beta for TCR — with VDJ or VJ recombination as appropriate, for human or mouse. It reports both the raw probability and its negative log10, which is the form you usually want: a rarity score that increases as receptors get less likely, on a scale that plots and ranks sensibly.

Results include a distribution view, so you can see where your repertoire sits before using the score as a filter.

Pgen also has a specific downstream role. [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) needs it as the null model for its primary hit-calling path: without a Pgen column, that block falls back to a threshold-based heuristic with no statistical error control. If you plan to run convergence detection, run this block first.

## Inputs & outputs

* **Input:** a BCR or TCR clonotype dataset with CDR3 sequences, amino acid or nucleotide, from any Platforma clonotyping or import block. Species is selected as human or mouse.
* **Output:** generation probability and −log10 generation probability per clonotype, as columns available to downstream blocks, plus a distribution view.

## Specifications

| | |
|---|---|
| Block title in app | Generation Probability |
| Engine | [OLGA](https://github.com/statbiophys/OLGA) with its fast Pgen implementation |
| Chains | IGH (heavy, VDJ), IGK (kappa, VJ), IGL (lambda, VJ), TRB (beta, VDJ), TRA (alpha, VJ) |
| Species | Human, mouse |
| Sequence types | Amino acid or nucleotide CDR3 |
| Outputs | Generation probability, −log10 generation probability |
| Views | Main table, Pgen distribution |

## Use cases

* **Enable full-STAR convergence detection:** supply the Pgen null model [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) needs for FDR-controlled hit calling.
* **Rank by clonal rarity:** prioritize receptors unlikely to have arisen by chance, which are more likely to reflect genuine selection.
* **Distinguish public from private clonotypes:** high-Pgen CDR3s recur across individuals because recombination makes them easily; low-Pgen ones are individual-specific.
* **Filter out convergent-recombination artifacts:** identify sequences shared across samples for statistical rather than biological reasons.
* **Germline-distance signal:** use Pgen as a proxy for how far a receptor sits from the default recombination output.
* **Lead ranking:** include rarity alongside enrichment, developability, and abundance in [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection).

## FAQ

### What is generation probability?

The probability that V(D)J recombination produces a given CDR3 by chance, computed from a statistical model of the recombination process. It does not depend on your data — it is a property of the sequence and the recombination machinery of the species and chain.

### Why does it matter that a clonotype is rare?

Because it changes what its presence means. A CDR3 that recombination produces constantly will appear in many repertoires without any selection; finding it tells you little. A CDR3 that recombination almost never produces, found at appreciable frequency, is much more likely to have been selected and expanded — which is exactly what a discovery campaign is looking for.

### Should I use Pgen or −log10 Pgen?

−log10 for almost everything. Raw probabilities span many orders of magnitude and cluster near zero, which makes plots and rankings unhelpful. The negative log10 turns rarity into an increasing score on a readable scale, while the raw value is there when you need the probability itself.

### Do I need this block before Clonotype Convergence?

For its primary path, yes. Convergence detection's full-STAR mode tests each clonotype against a null model built from Pgen and controls the false discovery rate; without a Pgen column it degrades to a threshold heuristic with no error control. Running this block first is what makes convergence calls statistically meaningful.

### Which chains and species are supported?

BCR heavy, kappa, and lambda, and TCR alpha and beta, for human and mouse — each with the recombination model appropriate to it. Chains outside that set have no OLGA model available.

### Does it work on nucleotide sequences?

Yes. Both amino acid and nucleotide CDR3s are supported.

## Citation

Pgen is computed with OLGA, from the Statistical Biophysics group. If you use this block in your research, please cite:

> Sethna, Z., Elhanati, Y., Callan, C. G., Walczak, A. M., & Mora, T. (2019). OLGA: fast computation of generation probabilities of B- and T-cell receptor amino acid sequences and motifs. *Bioinformatics* **35**(17), 2974–2981. [https://doi.org/10.1093/bioinformatics/btz035](https://doi.org/10.1093/bioinformatics/btz035)

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory), built on [OLGA](https://github.com/statbiophys/OLGA). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for V(D)J analysis at [docs.platforma.bio/biology-guides/vdj-analysis](https://docs.platforma.bio/biology-guides/vdj-analysis/).
