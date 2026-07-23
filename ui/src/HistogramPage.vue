<script lang="ts" setup>
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { PGEN_NAME } from "@platforma-open/milaboratories.generation-probability.model";
import type { PColumnIdAndSpec, PColumnSpec } from "@platforma-sdk/model";
import { computed } from "vue";
import { useApp } from "./app";

const app = useApp();

// Heavy is single-cell slot "A"; fall back to whatever single column exists.
function pickDefaultSource(cols: PColumnIdAndSpec[]) {
  const heavy = cols.find((c) => c.spec.domain?.["pl7.app/vdj/scClonotypeChain"] === "A");
  return (heavy ?? cols[0]).spec;
}

const defaultOptions = computed((): PredefinedGraphOption<"histogram">[] | undefined => {
  const cols = app.model.outputs.pgenGraphPfCols;
  if (!cols || cols.length === 0) return undefined;
  return [{ inputName: "value", selectedSource: pickDefaultSource(cols) }];
});

function isPgenColumn(spec: PColumnSpec) {
  return spec.name === PGEN_NAME;
}
</script>

<template>
  <GraphMaker
    v-model="app.model.data.graphStateHistogram"
    chart-type="histogram"
    :p-frame="app.model.outputs.pgenGraphPf"
    :default-options="defaultOptions"
    :data-column-predicate="isPgenColumn"
    :status-text="{ noPframe: { title: 'Select a dataset and species, then press Run.' } }"
  />
</template>
