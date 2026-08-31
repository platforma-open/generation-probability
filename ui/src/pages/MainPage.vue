<script lang="ts" setup>
import { SPECIES_OPTIONS } from "@platforma-open/milaboratories.generation-probability.kind";
import {
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlDropdown,
  PlDropdownRef,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import { ref, watch } from "vue";
import { useApp } from "../app";

const app = useApp();

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pgenTable,
});

const settingsOpen = ref(app.model.data.inputAnchor === undefined);

const labelFor = (value: string | undefined) =>
  app.model.outputs.inputOptions?.find((option) => option.value === value)?.label ?? "";

function selectDataset(value: string | undefined) {
  app.model.data.inputAnchor = value;
  app.model.data.datasetLabel = labelFor(value);
}

// A project template seeds `inputAnchor` alone -- `datasetLabel` is derived
// from the picked option, so the kind's contract leaves it out and the block
// starts with a dataset and no label, showing a subtitle with the species but
// no dataset. Fill it once the options resolve, from the same lookup the picker
// uses. Fires at most once per dataset: the guard is "label is empty", and
// writing it makes that false.
watch(
  () => [app.model.data.inputAnchor, app.model.outputs.inputOptions] as const,
  () => {
    if (!app.model.data.inputAnchor || app.model.data.datasetLabel) return;
    const label = labelFor(app.model.data.inputAnchor);
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
    <PlDropdownRef
      :model-value="app.model.data.inputAnchor"
      @update:model-value="selectDataset"
      :options="app.model.outputs.inputOptions ?? []"
      label="Clonotype dataset"
      :required="true"
      :error="!app.model.data.inputAnchor ? 'Clonotype dataset is required' : undefined"
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
