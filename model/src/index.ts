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

export const SPECIES_OPTIONS = [
  { label: "Human", value: "human" },
  { label: "Mouse", value: "mouse" },
] as const;

export const PGEN_NAME = "pl7.app/vdj/generationProbability";
const CHAIN_NAME = "pl7.app/vdj/chain";

export type BlockData = {
  inputAnchor?: string;
  datasetLabel: string;
  species?: (typeof SPECIES_OPTIONS)[number]["value"];
  tableState: PlDataTableStateV2;
  distributionGraphState: GraphMakerState;
};

const inputSelectors = [
  {
    axes: [{ name: "pl7.app/vdj/clonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
  {
    axes: [{ name: "pl7.app/vdj/scClonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
  {
    axes: [{ name: "pl7.app/variantKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
];

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
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

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (data.inputAnchor == null) throw new Error("Input dataset is required");
    if (data.species == null) throw new Error("Species is required");
    return {
      inputAnchor: data.inputAnchor,
      species: data.species,
    };
  })

  .output("inputOptions", () => {
    const collection = ColumnsCollection(["result_pool"]).filter({
      include: inputSelectors,
    });
    const scorableIds = new Set(
      collection
        .getColumns()
        .filter(
          (anchor) =>
            !ColumnsCollection(["result_pool"])
              .discover({
                anchors: { main: anchor.getSpec() },
                include: [{ name: [{ type: "exact", value: CHAIN_NAME }] }],
                mode: "enrichment",
              })
              .isEmpty(),
        )
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
