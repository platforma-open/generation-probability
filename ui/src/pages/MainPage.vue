<script lang="ts" setup>
import { SPECIES_OPTIONS } from "@platforma-open/milaboratories.generation-probability.kind";
import type { DatasetSelection, PlRef } from "@platforma-sdk/model";
import { createDatasetSelection, createPrimaryRef, plRefsEqual } from "@platforma-sdk/model";
import {
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlDatasetSelector,
  PlDropdown,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "../app";

const app = useApp();

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pgenTable,
});

const settingsOpen = ref(app.model.data.datasetRef === undefined);

// The subtitle label of the picked entry: the subset's when one is picked (its label already
// carries the dataset as a prefix, e.g. "VHH / IG Heavy / Isotype AD"), else the dataset's.
const labelFor = (ref: PlRef | undefined, filter: PlRef | undefined) => {
  if (ref === undefined) return "";
  const option = app.model.outputs.inputOptions?.find((o) => plRefsEqual(o.primary.ref, ref, true));
  if (filter !== undefined) {
    const filterLabel = option?.filters?.find((f) => plRefsEqual(f.ref, filter, true))?.label;
    if (filterLabel !== undefined) return filterLabel;
  }
  return option?.primary.label ?? "";
};

// The selector picks a dataset, or a dataset narrowed by one of its subset columns.
const datasetSelection = computed<DatasetSelection | undefined>({
  get: () => {
    const { datasetRef, filterRef } = app.model.data;
    if (datasetRef === undefined) return undefined;
    return createDatasetSelection(createPrimaryRef(datasetRef, filterRef));
  },
  set: (selection) => {
    app.model.data.datasetRef = selection?.primary.column;
    app.model.data.filterRef = selection?.primary.filter;
    app.model.data.datasetLabel = labelFor(selection?.primary.column, selection?.primary.filter);
  },
});

// A project template seeds `datasetRef` alone -- `datasetLabel` is derived
// from the picked option, so the kind's contract leaves it out and the block
// starts with a dataset and no label, showing a subtitle with the species but
// no dataset. Fill it once the options resolve, from the same lookup the picker
// uses. Fires at most once per dataset: the guard is "label is empty", and
// writing it makes that false.
watch(
  () => [app.model.data.datasetRef, app.model.outputs.inputOptions] as const,
  () => {
    if (!app.model.data.datasetRef || app.model.data.datasetLabel) return;
    const label = labelFor(app.model.data.datasetRef, app.model.data.filterRef);
    if (label) app.model.data.datasetLabel = label;
  },
  { immediate: true },
);

watch(
  () => app.model.outputs.isRunning,
  (isRunning) => {
    if (isRunning) settingsOpen.value = false;
  },
);
</script>

<template>
  <PlBlockPage title="Generation Probability">
    <template #append>
      <PlBtnGhost icon="settings" @click.stop="settingsOpen = true">Settings</PlBtnGhost>
    </template>

    <PlAlert v-if="app.model.outputs.skippedChains" type="warn" icon>
      Some clonotypes were left unscored — no recombination model for:
      {{ app.model.outputs.skippedChains.join(", ") }}.
    </PlAlert>

    <PlAgDataTableV2
      v-model="app.model.data.tableState"
      :settings="tableSettings"
      show-export-button
      not-ready-text="Select a dataset and species, then press Run."
      no-rows-text="No generation probabilities computed."
    />
  </PlBlockPage>

  <PlSlideModal v-model="settingsOpen" close-on-outside-click shadow>
    <template #title>Settings</template>
    <PlDatasetSelector
      v-model="datasetSelection"
      :options="app.model.outputs.inputOptions"
      label="Clonotype dataset"
      :required="true"
      :error="!app.model.data.datasetRef ? 'Clonotype dataset is required' : undefined"
      clearable
    />
    <PlDropdown
      v-model="app.model.data.species"
      :options="SPECIES_OPTIONS"
      label="Species"
      :required="true"
      :error="!app.model.data.species ? 'Species is required' : undefined"
      clearable
    />
  </PlSlideModal>
</template>
