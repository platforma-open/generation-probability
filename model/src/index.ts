import {
  BlockModelV3,
  ColumnsCollection,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  deriveColumnOptions,
  extractPObjectId,
  InferOutputsType,
  ListOptionBase,
  PlDataTableStateV2,
} from "@platforma-sdk/model";

export const SPECIES_OPTIONS = [
  { label: "Human", value: "human" },
  { label: "Mouse", value: "mouse" },
] as const;

const PGEN_NAME = "pl7.app/vdj/generationProbability";

export type BlockData = {
  inputAnchor?: string;
  datasetLabel: string;
  species?: (typeof SPECIES_OPTIONS)[number]["value"];
  tableState: PlDataTableStateV2;
};

const inputSelectors = [
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/clonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/scClonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
];

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  datasetLabel: "",
  tableState: createPlDataTableStateV2(),
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
    const collection = ColumnsCollection(["result_pool"]).filter({ include: inputSelectors });
    return deriveColumnOptions(collection).map<ListOptionBase<string>>(({ id, label }) => {
      return { value: id, label };
    });
  })

  .outputWithStatus("pgenTable", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;

    const [anchorId] = ColumnsCollection([pgenOutput])
      .filter({ include: { name: [{ type: "exact", value: PGEN_NAME }] } })
      .getColumnIds();
    if (anchorId === undefined) return undefined;

    return createPlDataTableV3(ctx, {
      tableState: ctx.data.tableState,
      columns: {
        anchors: { main: extractPObjectId(anchorId) },
        selector: { mode: "enrichment" },
      },
    });
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

  .sections(() => [{ type: "link", href: "/", label: "Main" }])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
