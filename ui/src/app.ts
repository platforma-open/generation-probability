import { platforma } from "@platforma-open/milaboratories.generation-probability.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import DistributionPage from "./pages/DistributionPage.vue";
import MainPage from "./pages/MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => ({
  progress: () => {
    if (!app.model.outputs.isRunning) return undefined;
    return app.model.outputs.progress ?? true;
  },
  routes: {
    "/": () => MainPage,
    "/distribution": () => DistributionPage,
  },
}));

export const useApp = sdkPlugin.useApp;
