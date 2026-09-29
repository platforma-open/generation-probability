import type { GraphMakerState } from "@milaboratories/graph-maker";
import type { DatasetOption, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  buildDatasetOptions,
  ColumnsCollection,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  deriveColumnOptions,
  InferOutputsType,
  isDataColumn,
  isPColumnSpec,
  isPlRef,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PlDataTableStateV2,
  plRefsEqual,
} from "@platforma-sdk/model";
import type { Species } from "@platforma-open/milaboratories.generation-probability.kind";
import { kind, SPECIES_OPTIONS } from "@platforma-open/milaboratories.generation-probability.kind";

export const PGEN_NAME = "pl7.app/vdj/generationProbability";
const CHAIN_NAME = "pl7.app/vdj/chain";

// A bare string in a selector normalises to a REGEX matcher -- unanchored, and
// with `.` as a wildcard. Every name here is one literal, so match it exactly:
// the pframe also carries `pl7.app/vdj/minlog10GenerationProbability`, and an
// unanchored pattern is one rename away from catching it.
const exactly = (value: string) => ({ type: "exact" as const, value });

// Two releases shipped under "v1" with different names for the chart state: the develop-branch
// release stored `graphStateHistogram`, main renamed it `distributionGraphState`. Both reach v2.
type BlockDataV1 = {
  inputAnchor?: string;
  datasetLabel: string;
  species?: Species;
  tableState: PlDataTableStateV2;
  distributionGraphState?: GraphMakerState;
  graphStateHistogram?: GraphMakerState;
};

const defaultDistributionGraphState = (): GraphMakerState => ({
  title: "Generation Probability",
  template: "bins",
  currentTab: null,
  layersSettings: { bins: { fillColor: "#99E099" } },
  axesSettings: { axisY: { scale: "log" } },
});

export type BlockData = {
  datasetRef?: PlRef;
  // Optional `pl7.app/isSubset` column picked alongside the dataset (e.g. a
  // repertoire-labeling label). Only clonotypes present in it are scored.
  filterRef?: PlRef;
  datasetLabel: string;
  species?: Species;
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

/**
 * A result-pool column id is the canonical JSON of its PlRef, so the two convert both ways.
 * The id form is what the workflow reads (`args.inputAnchor`) and what v1 stored, so keeping
 * it byte-identical keeps existing blocks' args unchanged.
 */
export function plRefFromColumnId(id: string | undefined): PlRef | undefined {
  if (id === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(id);
    return isPlRef(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Keys in canonical (sorted) order: this must equal the pool's own column id.
export const columnIdFromPlRef = (ref: PlRef): string =>
  JSON.stringify({ __isRef: true, blockId: ref.blockId, name: ref.name });

// The key axis is found by name, never by position: which index it sits at is a property of the
// producer, and main.tpl.tengo searches for it the same way rather than assuming one.
const keyAxisOf = (spec: { axesSpec: { name: string; domain?: Record<string, string> }[] }) =>
  spec.axesSpec.find((axis) => ENTITY_KEY_NAMES.includes(axis.name));

const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  // v2 — the dataset is stored as a PlRef (PlDatasetSelector works in refs), next to an
  // optional subset filter.
  .migrate<BlockData>(
    "v2",
    ({ inputAnchor, graphStateHistogram, distributionGraphState, ...rest }) => ({
      ...rest,
      datasetRef: plRefFromColumnId(inputAnchor),
      distributionGraphState:
        distributionGraphState ?? graphStateHistogram ?? defaultDistributionGraphState(),
    }),
  )
  .init(({ params }) => ({
    datasetRef: params?.datasetRef,
    filterRef: params?.filterRef,
    species: params?.species,
    datasetLabel: "",
    tableState: createPlDataTableStateV2(),
    distributionGraphState: defaultDistributionGraphState(),
  }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args((data) => {
    if (data.datasetRef == null) throw new Error("Input dataset is required");
    if (data.species == null) throw new Error("Species is required");
    return {
      inputAnchor: columnIdFromPlRef(data.datasetRef),
      species: data.species,
      // Column-id form, like `inputAnchor`: the workflow stamps this exact string as the
      // outputs' `pl7.app/subset` domain value, so consumers can compare it to their own filter.
      ...(data.filterRef !== undefined && { inputFilter: columnIdFromPlRef(data.filterRef) }),
    };
  })

  // Inverse of the kind's init-params contract: the same two fields `init`
  // consumes. `datasetLabel` is derived by the UI from the picked option, and
  // the table / chart states are view state -- neither is configuration a
  // template carries.
  .templateParams((data) => ({
    datasetRef: data.datasetRef,
    filterRef: data.filterRef,
    species: data.species,
  }))

  .output("inputOptions", (ctx): DatasetOption[] => {
    const collection = ColumnsCollection(["result_pool"]).filter({
      include: inputSelectors,
    });
    // A dataset is scorable when the locus can be established. Normally that means a per-record
    // pl7.app/vdj/chain column. An imported receptor set has none: the locus is a property of
    // the whole set and is read from the key axis instead -- pl7.app/vdj/chain for a single
    // mapped chain, or pl7.app/vdj/receptor plus the chain column domain for a paired one --
    // so requiring the column would keep every imported set out of this dropdown.
    const scorable = collection.getColumns().filter((anchor) => {
      const spec = anchor.getSpec();
      const keyAxis = keyAxisOf(spec);
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
          anchors: { main: spec },
          include: [{ name: [exactly(CHAIN_NAME)] }],
          mode: "enrichment",
        })
        .isEmpty();
    });
    if (scorable.length === 0) return [];

    // Subset columns (`pl7.app/isSubset`) on each dataset's axes, e.g. repertoire-labeling
    // labels or Lead Selection picks. Only the filters are taken from here: its primary refs
    // carry `requireEnrichments`, which would make this block depend on every block between
    // it and the dataset. The primary predicate only has to cover the datasets above:
    // results are matched to them by ref.
    const withFilters =
      buildDatasetOptions(ctx, {
        primary: (spec) =>
          isPColumnSpec(spec) &&
          spec.annotations?.["pl7.app/isAnchor"] === "true" &&
          keyAxisOf(spec) !== undefined,
        // Only subsets keyed by the clonotype axis alone: Pgen is scored per clonotype.
        filter: (spec) =>
          isPColumnSpec(spec) &&
          spec.axesSpec.length === 1 &&
          ENTITY_KEY_NAMES.includes(spec.axesSpec[0]?.name ?? ""),
      }) ?? [];

    // Label the survivors only: `deriveColumnOptions` reads the spec of every
    // entry it is handed, so passing the whole collection here would re-read
    // the ones just discarded.
    return deriveColumnOptions([{ columns: scorable, isFinal: collection.isFinal() }]).flatMap(
      ({ id, label }) => {
        const ref = plRefFromColumnId(id);
        if (ref === undefined) return [];
        const primary = { ref, label };
        const filters = withFilters.find((o) => plRefsEqual(o.primary.ref, ref, true))?.filters;
        return [filters === undefined ? { primary } : { primary, filters }];
      },
    );
  })

  .outputWithStatus("pgenTable", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const collection = ColumnsCollection([pgenOutput]);
    if (!collection.isFinal()) return undefined;
    return createPlDataTableV3(ctx, {
      // Every column here comes straight off the block's own pframe accessor, so
      // they are all bare leaves and pass `hasSingleDataColumn` by construction.
      primaryColumns: collection.filter({ include: [{ name: exactly(PGEN_NAME) }] }).getColumns(),
      columns: collection.filter({ exclude: [{ name: exactly(PGEN_NAME) }] }).getColumns(),
      tableState: ctx.data.tableState,
    });
  })

  // Only the raw pgen columns (one per chain), so the graph's value picker doubles as the
  // Heavy/Light chooser.
  .outputWithStatus("pgenGraphPf", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const collection = ColumnsCollection([pgenOutput]);
    if (!collection.isFinal()) return undefined;
    // Narrow host-side: only the survivors pay a spec and data round-trip.
    // `isDataColumn` is the right guard for the PColumn bridge -- `PColumn.id`
    // is typed `PObjectId`, which only a bare leaf carries.
    const pgenCols = collection
      .filter({ include: [{ name: exactly(PGEN_NAME) }] })
      .getColumns()
      .filter(isDataColumn)
      .map<PColumn<undefined | PColumnDataUniversal>>((column) => ({
        id: column.id,
        spec: column.getSpec(),
        data: column.getData(),
      }));
    if (pgenCols.length === 0) return undefined;
    return createPFrameForGraphs(ctx, pgenCols);
  })

  .output("pgenGraphPfCols", (ctx) => {
    const pgenOutput = ctx.outputs?.resolve("pgenPf");
    if (pgenOutput === undefined) return undefined;
    const collection = ColumnsCollection([pgenOutput]);
    if (!collection.isFinal()) return undefined;
    // `PColumnIdAndSpec.columnId` is a `PObjectId` slot, same constraint as
    // `PColumn.id` above.
    return collection
      .filter({ include: [{ name: exactly(PGEN_NAME) }] })
      .getColumns()
      .filter(isDataColumn)
      .map<PColumnIdAndSpec>((column) => ({ columnId: column.id, spec: column.getSpec() }));
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
