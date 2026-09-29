import { awaitStableState, ML, tplTest } from "@platforma-sdk/test";
import { expect } from "vitest";

// Clonotypes k1..k3; the subset tags k1 and k3.
const label = (l: string) => ({ "pl7.app/label": l });
const keyAxis = { name: "pl7.app/vdj/clonotypeKey", type: "String", annotations: label("Clonotype") };
const specs = {
  cdr3: { kind: "PColumn", name: "pl7.app/vdj/sequence", valueType: "String", domain: { "pl7.app/vdj/feature": "CDR3" }, axesSpec: [keyAxis], annotations: label("CDR3") },
  chain: { kind: "PColumn", name: "pl7.app/vdj/chain", valueType: "String", axesSpec: [keyAxis], annotations: label("Chain") },
  tag: { kind: "PColumn", name: "pl7.app/tag", valueType: "Int", axesSpec: [keyAxis], annotations: { ...label("IgG"), "pl7.app/isSubset": "true" } },
};
const k = (v: string) => JSON.stringify([v]);
const data = {
  cdr3: { keyLength: 1, data: { [k("k1")]: "CARDYW", [k("k2")]: "CARGGW", [k("k3")]: "CASSLW" } },
  chain: { keyLength: 1, data: { [k("k1")]: "IGH", [k("k2")]: "IGH", [k("k3")]: "IGH" } },
  tag: { keyLength: 1, data: { [k("k1")]: 1, [k("k3")]: 1 } },
};

tplTest("subset filter: scorer input and Pgen domain stamp", { timeout: 120000 }, async ({ helper, driverKit }) => {
  const result = await helper.renderTemplate(false, "test.subset.test", ["full", "filtered", "domains"], (tx) => {
    const inputs: Record<string, ReturnType<typeof tx.createValue>> = {
      specs: tx.createValue(ML.Pl.JsonObject, JSON.stringify(specs)),
    };
    for (const [name, d] of Object.entries(data)) {
      const r = tx.createStruct({ name: "PColumnData/Json", version: "1" }, JSON.stringify(d));
      tx.lockInputs(r);
      inputs[name] = r;
    }
    return inputs;
  });

  const lines = async (output: string) => {
    const handle = await awaitStableState(
      result.computeOutput(output, (acc, ctx) =>
        acc ? driverKit.blobDriver.getOnDemandBlob(acc.persist(), ctx).handle : undefined,
      ),
      90000,
    );
    return (await driverKit.blobDriver.getContent(handle!)).toString().trim().split("\n");
  };

  // Every clonotype is scored without a filter; with one, only the tagged ones, and the
  // filter column itself never reaches the scorer.
  expect(await lines("full")).toEqual([
    "clonotypeKey\tcdr3_H\tchain_H",
    "k1\tCARDYW\tIGH",
    "k2\tCARGGW\tIGH",
    "k3\tCASSLW\tIGH",
  ]);
  expect(await lines("filtered")).toEqual([
    "clonotypeKey\tcdr3_H\tchain_H",
    "k1\tCARDYW\tIGH",
    "k3\tCASSLW\tIGH",
  ]);

  const domains = await awaitStableState(
    result.computeOutput("domains", (acc) => acc?.getDataAsJson<Record<string, Record<string, string>>>()),
    90000,
  );
  expect(domains).toEqual({
    fullRun: { "pl7.app/alphabet": "aminoacid" },
    subsetRun: { "pl7.app/alphabet": "aminoacid", "pl7.app/subset": "SUBSET_ID" },
    unitAfter: { "pl7.app/alphabet": "aminoacid" },
  });
});
