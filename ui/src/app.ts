import { platforma } from "@platforma-open/milaboratories.generation-probability.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => ({
  progress: () => {
    if (!app.model.outputs.isRunning) return undefined;
    return app.model.outputs.progress ?? true;
  },
  routes: {
    "/": () => MainPage,
  },
}));

export const useApp = sdkPlugin.useApp;
