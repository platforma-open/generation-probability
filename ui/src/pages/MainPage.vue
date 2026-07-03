<script lang="ts" setup>
import type { Species } from "@platforma-open/milaboratories.generation-probability.model";
import type { PlRef } from "@platforma-sdk/model";
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

const speciesOptions: { label: string; value: Species }[] = [
  { label: "Human", value: "human" },
  { label: "Mouse", value: "mouse" },
];

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.table,
});

// Snapshot the dataset label into data on the pick gesture (not a reactive watcher),
// so the args-only .subtitle() can show it. Written together with the ref, once.
function onPickInput(inputRef: PlRef | undefined) {
  app.model.data.inputAnchor = inputRef;
  const options = app.model.outputs.inputOptions ?? [];
  const match = inputRef
    ? options.find((o) => o.ref?.blockId === inputRef.blockId && o.ref?.name === inputRef.name)
    : undefined;
  app.model.data.datasetLabel = match?.label ?? "";
}

// Open settings automatically when there's no input yet; close it once a Run commits.
const settingsOpen = ref(app.model.data.inputAnchor === undefined);

// `runArgsId` changes only when a Run commits new args, so this fires exactly once
// per run regardless of duration or cached recomputes — more reliable than watching
// the transient `isRunning` edge (which raced on the running-state sync).
watch(
  () => app.model.outputs.runArgsId,
  (id, prev) => {
    if (id !== undefined && id !== prev) settingsOpen.value = false;
  },
);
</script>

<template>
  <PlBlockPage>
    <template #title>Generation Probability</template>
    <template #append>
      <PlBtnGhost icon="settings" @click.stop="settingsOpen = true">Settings</PlBtnGhost>
    </template>

    <PlAlert
      v-for="(message, index) in app.model.outputs.warnings ?? []"
      :key="index"
      type="warn"
      label="Generation probability"
    >
      {{ message }}
    </PlAlert>

    <PlAgDataTableV2
      v-model="app.model.data.tableState"
      :settings="tableSettings"
      show-export-button
      not-ready-text="Set the clonotype dataset and species, then Run."
      no-rows-text="No generation probabilities computed."
    />
  </PlBlockPage>

  <PlSlideModal v-model="settingsOpen" close-on-outside-click shadow>
    <template #title>Settings</template>
    <PlDropdownRef
      :model-value="app.model.data.inputAnchor"
      :options="app.model.outputs.inputOptions ?? []"
      label="Clonotype dataset"
      :required="true"
      :error="!app.model.data.inputAnchor ? 'Clonotype dataset is required' : undefined"
      clearable
      @update:model-value="onPickInput"
    >
      <template #tooltip> MiXCR clonotyping output to score. Real V(D)J BCR/TCR only. </template>
    </PlDropdownRef>
    <PlDropdown
      v-model="app.model.data.species"
      :options="speciesOptions"
      label="Species"
      :required="true"
      :error="!app.model.data.species ? 'Species is required' : undefined"
      clearable
    >
      <template #tooltip>
        Picks the OLGA recombination model. MiXCR does not carry species on the clonotype data, so
        it must be set here.
      </template>
    </PlDropdown>
  </PlSlideModal>
</template>
