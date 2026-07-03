import type { InferOutputsType, PlDataTableStateV2, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  discoverTableColumnSnaphots,
} from "@platforma-sdk/model";
// Re-export helpers types so the inferred `platforma` type can be named without a
// non-portable reference to @milaboratories/helpers (avoids TS2742).
export type * from "@milaboratories/helpers";

export type Species = "human" | "mouse";

export type BlockData = {
  inputAnchor?: PlRef;
  // Species picks the OLGA recombination model. MiXCR does not carry species on
  // the clonotype columns, so it is a block parameter (see NOTES / spec A-0008).
  species?: Species;
  // Input dataset label, snapshotted by the UI on the pick gesture (not a watcher).
  // Read by the args-only .subtitle() so the sidebar shows the dataset. Display-only:
  // NOT projected into args, so it never affects workflow dedup.
  datasetLabel: string;
  tableState: PlDataTableStateV2;
};

// Column names emitted by the workflow (process.tpl.tengo). Per-chain single-cell
// columns share these names and are distinguished only by the domain below.
export const PGEN_COLUMN = "pl7.app/vdj/pgen";
export const NEG_LOG_PGEN_COLUMN = "pl7.app/vdj/negLog10Pgen";

// Single-cell per-chain domain: 'A' = Heavy/Beta, 'B' = Light/Alpha.
export const CHAIN_DOMAIN = "pl7.app/vdj/scClonotypeChain";
export const CHAIN_INDEX_DOMAIN = "pl7.app/vdj/scClonotypeChain/index";
export const CHAIN_HEAVY = "A";

// Input dataset selectors — MiXCR clonotype anchors. Pgen applies to real
// V(D)J-derived BCR and TCR (human/mouse), single-cell and bulk. Bulk clonotype
// axes carry the producer's chainInfos keys on `pl7.app/vdj/chain`; single-cell
// scClonotype axes carry `pl7.app/vdj/receptor`.
const BULK_CHAINS = ["IGHeavy", "IGLight", "TCRBeta", "TCRAlpha"];
const inputSelectors = [
  ...BULK_CHAINS.map((chain) => ({
    axes: [
      { name: "pl7.app/sampleId" },
      { name: "pl7.app/vdj/clonotypeKey", domain: { "pl7.app/vdj/chain": chain } },
    ],
    annotations: { "pl7.app/isAnchor": "true" },
  })),
  // Single-cell receptor domain values are the producer's receptorInfos keys:
  // 'IG' (BCR) and 'TCRAB' (alpha/beta TCR). 'TCRGD' (gamma/delta) has no OLGA
  // model and is intentionally excluded.
  ...["IG", "TCRAB"].map((receptor) => ({
    axes: [
      { name: "pl7.app/sampleId" },
      { name: "pl7.app/vdj/scClonotypeKey", domain: { "pl7.app/vdj/receptor": receptor } },
    ],
    annotations: { "pl7.app/isAnchor": "true" },
  })),
];

const dataModel = new DataModelBuilder()
  .from<BlockData>("v1")
  .init(() => ({ datasetLabel: "", tableState: createPlDataTableStateV2() }));

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (data.inputAnchor == null) throw new Error("Input dataset is required");
    if (data.species == null) throw new Error("Species is required");
    return {
      inputAnchor: data.inputAnchor,
      species: data.species,
    };
  })

  .output("inputOptions", (ctx) => ctx.resultPool.getOptions(inputSelectors))

  .outputWithStatus("table", (ctx) => {
    const ownCols = ctx.outputs?.resolve("pgenFrame")?.getPColumns();
    const anchorSpec = ownCols?.[0]?.spec;
    if (anchorSpec === undefined) return undefined;

    // Discover columns on the clonotype axis, then keep ONLY this block's own Pgen
    // columns. `maxHops: 0` stops enrichment from traversing linkers into every
    // downstream block — plain enrichment pulled ~227 co-axial columns on AB015
    // (every sequence/mutation/liability/gene column), and building that join hangs
    // the shared PFrame driver, breaking every block's table. Filtering the
    // discovered variants to our own column names keeps the table small (and stays
    // on V3, unlike the deprecated createPlDataTableV2).
    const ownNames = new Set([PGEN_COLUMN, NEG_LOG_PGEN_COLUMN]);
    const variants = discoverTableColumnSnaphots(ctx, {
      anchors: { main: anchorSpec },
      selector: { mode: "enrichment", maxHops: 0 },
    });
    if (variants === undefined) return undefined;
    const ownVariants = variants.filter((v) => ownNames.has(v.column.spec.name));
    if (ownVariants.length === 0) return undefined;

    return createPlDataTableV3(ctx, {
      columns: ownVariants,
      tableState: ctx.data.tableState,
    });
  })

  // Non-fatal warnings from the workflow (count of clonotypes with no computable
  // Pgen). Empty array when everything scored. UI renders as a PlAlert banner.
  .output("warnings", (ctx) => ctx.outputs?.resolve("warnings")?.getDataAsJson<string[]>() ?? [])

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  // Stable id of the last committed run args. `activeArgs` changes only when a
  // Run actually commits new args, so this fires once per run regardless of run
  // duration or cached/fast recomputes — the UI watches it to auto-close the
  // Settings panel. Replaces an `isRunning` false→true watch, which raced on the
  // running-state sync (see clonotype-convergence). Args are fixed-shape, so
  // JSON.stringify is a deterministic key without pulling in canonicalize.
  .output("runArgsId", (ctx) =>
    ctx.activeArgs === undefined ? undefined : JSON.stringify(ctx.activeArgs),
  )

  // Latest progress fraction per chain: the OLGA scorer prints a bare 0..1 number
  // per ~1% to stderr, and getProgressLog("") returns the last line of that stream.
  // app.ts turns these into the built-in progress strip. There is no log view — the
  // stream is only synthetic progress, so it's not worth showing (OLGA itself emits
  // nothing useful; its noise is suppressed).
  .output("progressHeavy", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "progressHeavy", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getProgressLog(""),
  )
  .output("progressLight", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "progressLight", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getProgressLog(""),
  )

  .title(() => "Generation Probability")

  // Sidebar subtitle. The subtitle lambda runs in an args-only context (no resultPool
  // /outputs — pl-middle-layer constructBlockContextArgsOnly), so it reads `data` only.
  // The UI snapshots the input dataset's label into `datasetLabel` on the pick gesture
  // (the V3-clean way — a user-gesture write, not a reactive watcher). Append species.
  .subtitle((ctx) => {
    const species =
      ctx.data.species === "human" ? "Human" : ctx.data.species === "mouse" ? "Mouse" : "";
    return [ctx.data.datasetLabel, species].filter(Boolean).join(" - ");
  })

  .sections((_ctx) => [{ type: "link" as const, href: "/" as const, label: "Table" }])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
