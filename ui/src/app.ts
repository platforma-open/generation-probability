import { platforma } from "@platforma-open/milaboratories.generation-probability.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";

// The scorer prints a bare 0..1 fraction per progress tick; getProgressLog gives us
// the latest line. Parse it back to a number.
function progressFraction(line?: string): number | undefined {
  if (line == null) return undefined;
  const value = Number(line.trim());
  return Number.isFinite(value) ? value : undefined;
}

export const sdkPlugin = defineAppV3(platforma, (app) => {
  return {
    // Drives the built-in progress strip above the content. Average of the chains
    // being scored; undefined (no strip) when there's no progress line yet.
    progress: () => {
      const values = [
        progressFraction(app.model.outputs.progressHeavy),
        progressFraction(app.model.outputs.progressLight),
      ].filter((value): value is number => value !== undefined);
      if (values.length === 0) return undefined;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    },
    routes: {
      "/": () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
