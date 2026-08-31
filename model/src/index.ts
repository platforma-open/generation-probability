import type { GraphMakerState } from "@milaboratories/graph-maker";
import {
  AccessorColumnsProvider,
  BlockModelV3,
  ColumnsCollection,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  deriveColumnOptions,
  InferOutputsType,
  ListOptionBase,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PlDataTableStateV2,
} from "@platforma-sdk/model";
import { kind, SPECIES_OPTIONS } from "@platforma-open/milaboratories.generation-probability.kind";

// Re-exported for the UI's species dropdown. Defined in the kind so the
// init-params contract and the dropdown cannot name different sets.
export { SPECIES_OPTIONS };
export type { Species } from "@platforma-open/milaboratories.generation-probability.kind";

export const PGEN_NAME = "pl7.app/vdj/generationProbability";
const CHAIN_NAME = "pl7.app/vdj/chain";

export type BlockData = {
  inputAnchor?: string;
  datasetLabel: string;
  species?: (typeof SPECIES_OPTIONS)[number]["value"];
  tableState: PlDataTableStateV2;
  distributionGraphState: GraphMakerState;
};

// The axes a dataset can be keyed on, mirroring ENTITY_KEY_NAMES in main.tpl.tengo. Both the
// selectors and the scorability check below are derived from this one list so they cannot drift.
const ENTITY_KEY_NAMES = [
  "pl7.app/vdj/clonotypeKey",
  "pl7.app/vdj/scClonotypeKey",
  "pl7.app/variantKey",
];

const inputSelectors = ENTITY_KEY_NAMES.map((name) => ({
  axes: [{ name }],
  annotations: { "pl7.app/isAnchor": "true" },
}));

// The key axis is found by name, never by position: which index it sits at is a property of the
// producer, and main.tpl.tengo searches for it the same way rather than assuming one.
const keyAxisOf = (spec: { axesSpec: { name: string; domain?: Record<string, string> }[] }) =>
  spec.axesSpec.find((axis) => ENTITY_KEY_NAMES.includes(axis.name));

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(({ params }) => ({
  inputAnchor: params?.inputAnchor,
  species: params?.species,
  datasetLabel: "",
  tableState: createPlDataTableStateV2(),
  distributionGraphState: {
    title: "Generation Probability",
    template: "bins",
    currentTab: null,
    layersSettings: { bins: { fillColor: "#99E099" } },
    axesSettings: { axisY: { scale: "log" } },
  },
}));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args((data) => {
    if (data.inputAnchor == null) throw new Error("Input dataset is required");
    if (data.species == null) throw new Error("Species is required");
    return {
      inputAnchor: data.inputAnchor,
      species: data.species,
    };
  })

  // Inverse of the kind's init-params contract: the same two fields `init`
  // consumes. `datasetLabel` is derived by the UI from the picked option, and
  // the table / chart states are view state -- neither is configuration a
  // template carries.
  .templateParams((data) => ({ inputAnchor: data.inputAnchor, species: data.species }))

  .output("inputOptions", () => {
    const collection = ColumnsCollection(["result_pool"]).filter({
      include: inputSelectors,
    });
    // A dataset is scorable when the locus can be established. Normally that means a per-record
    // pl7.app/vdj/chain column. An imported receptor set has none: the locus is a property of
    // the whole set and is read from the key axis instead -- pl7.app/vdj/chain for a single
    // mapped chain, or pl7.app/vdj/receptor plus the chain column domain for a paired one --
    // so requiring the column would keep every imported set out of this dropdown.
    const scorableIds = new Set(
      collection
        .getColumns()
        .filter((anchor) => {
          const keyAxis = keyAxisOf(anchor.getSpec());
          const keyDomain = keyAxis?.domain ?? {};
          if (
            keyAxis?.name === "pl7.app/variantKey" &&
            keyDomain["pl7.app/vdj/clonotypingRunId"] !== undefined
          ) {
            return (
              keyDomain["pl7.app/vdj/chain"] !== undefined ||
              keyDomain["pl7.app/vdj/receptor"] !== undefined
            );
          }
          return !ColumnsCollection(["result_pool"])
            .discover({
              anchors: { main: anchor.getSpec() },
              include: [{ name: [{ type: "exact", value: CHAIN_NAME }] }],
              mode: "enrichment",
            })
            .isEmpty();
        })
        .map((anchor) => anchor.id),
    );
    return deriveColumnOptions(collection)
      .filter(({ id }) => scorableIds.has(id))
      .map<ListOptionBase<string>>(({ id, label }) => ({ value: id, label }));
  })

  .outputWithStatus("pgenTable", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const collection = ColumnsCollection([pgenOutput]);
    if (!collection.isFinal()) return undefined;
    return createPlDataTableV3(ctx, {
      primaryColumns: collection.filter({ include: [{ name: PGEN_NAME }] }).getColumns(),
      columns: collection.filter({ exclude: [{ name: PGEN_NAME }] }).getColumns(),
      tableState: ctx.data.tableState,
    });
  })

  // Only the raw pgen columns (one per chain), so the graph's value picker doubles as the
  // Heavy/Light chooser.
  .outputWithStatus("pgenGraphPf", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const provider = AccessorColumnsProvider(pgenOutput);
    if (!provider.isFinal()) return undefined;
    const pgenCols = provider
      .getColumns()
      .map<PColumn<undefined | PColumnDataUniversal>>((column) => ({
        id: column.id,
        spec: column.getSpec(),
        data: column.getData(),
      }))
      .filter((column) => column.spec.name === PGEN_NAME);
    if (pgenCols.length === 0) return undefined;
    return createPFrameForGraphs(ctx, pgenCols);
  })

  .output("pgenGraphPfCols", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const provider = AccessorColumnsProvider(pgenOutput);
    if (!provider.isFinal()) return undefined;
    return provider
      .getColumns()
      .map<PColumnIdAndSpec>((column) => ({ columnId: column.id, spec: column.getSpec() }))
      .filter((column) => column.spec.name === PGEN_NAME);
  })

  .output("progress", (ctx) =>
    ctx.outputs
      ?.resolve("progress")
      ?.getProgressLog("progress: ")
      .mapDefined((progressLine) => {
        const progress = progressLine?.match(/progress: (?<progress>\S+)/)?.groups?.progress;
        if (!progress) return true;
        return Number(progress) || true;
      }),
  )

  .output("skippedChains", (ctx) =>
    ctx.outputs
      ?.resolve("progress")
      ?.getProgressLog("skipped: ")
      .mapDefined((line) => {
        const match = line?.match(/skipped: (?<chains>.*)/)?.groups;
        if (!match) return undefined;
        const chains = match.chains.split(",").filter(Boolean);
        if (chains.length === 0) return undefined;
        return chains;
      }),
  )

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Generation Probability")

  .subtitle((ctx) =>
    [
      ctx.data.datasetLabel,
      SPECIES_OPTIONS.find((option) => option.value === ctx.data.species)?.label,
    ]
      .filter(Boolean)
      .join(" - "),
  )

  .sections(() => [
    { type: "link", href: "/", label: "Main" },
    { type: "link", href: "/distribution", label: "Distribution" },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
