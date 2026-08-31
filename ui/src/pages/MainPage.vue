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

function selectDataset(value: string | undefined) {
  app.model.data.inputAnchor = value;
  app.model.data.datasetLabel =
    app.model.outputs.inputOptions?.find((option) => option.value === value)?.label ?? "";
}

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
