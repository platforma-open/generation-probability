import { awaitStableState, ML, tplTest } from "@platforma-sdk/test";
import { expect } from "vitest";

const label = (l: string) => ({ "pl7.app/label": l });
const keyAxis = { name: "pl7.app/vdj/clonotypeKey", type: "String", annotations: label("Clonotype") };
const specs = {
  cdr3: { kind: "PColumn", name: "pl7.app/vdj/sequence", valueType: "String", domain: { "pl7.app/vdj/feature": "CDR3" }, axesSpec: [keyAxis], annotations: label("CDR3") },
  chain: { kind: "PColumn", name: "pl7.app/vdj/chain", valueType: "String", axesSpec: [keyAxis], annotations: label("Chain") },
};
const k = (v: string) => JSON.stringify([v]);
const data = {
  cdr3: { keyLength: 1, data: { [k("k1")]: "CASSLGQAYEQYF", [k("k2")]: "CASSPGTGGNEQFF", [k("k3")]: "CARDRGYSSGWYFDYW", [k("k4")]: "CAVRDSNYQLIW" } },
  chain: { keyLength: 1, data: { [k("k1")]: "TRB", [k("k2")]: "TRB", [k("k3")]: "IGH", [k("k4")]: "TRA" } },
};
const expectedPgen: Record<string, number> = {
  k1: 7.470066108616248e-7,
  k2: 1.0204808716438236e-7,
  k3: 1.7236462406372022e-8,
  k4: 1.4539565968146519e-5,
};

const expectRelClose = (actual: number, expected: number, message: string) =>
  expect(Math.abs(actual - expected) / Math.abs(expected), message).toBeLessThan(1e-6);

tplTest("pgen-process: the Python scorer gives known Pgen values on the backend", { timeout: 300000 }, async ({ helper, driverKit }) => {
  const result = await helper.renderTemplate(false, "test.pgen-process.test", ["table"], (tx) => {
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

  const handle = await awaitStableState(
    result.computeOutput("table", (acc, ctx) =>
      acc ? driverKit.blobDriver.getOnDemandBlob(acc.persist(), ctx).handle : undefined,
    ),
    280000,
  );
  const [header, ...rows] = (await driverKit.blobDriver.getContent(handle!)).toString().trim().split("\n").map((l) => l.split("\t"));
  const keyIdx = header.indexOf("Clonotype");
  const pgenIdx = header.indexOf("Generation probability");
  const neglogIdx = header.indexOf("-log10 generation probability");
  expect(header).toEqual(expect.arrayContaining(["Clonotype", "Generation probability", "-log10 generation probability"]));
  expect(rows).toHaveLength(Object.keys(expectedPgen).length);

  const byKey = Object.fromEntries(rows.map((r) => [r[keyIdx], { pgen: r[pgenIdx], neglog: r[neglogIdx] }]));
  expect(Object.keys(byKey).sort()).toEqual(Object.keys(expectedPgen));
  for (const [key, expected] of Object.entries(expectedPgen)) {
    const { pgen, neglog } = byKey[key];
    expect(pgen, key).not.toBe("NA");
    expect(neglog, key).not.toBe("NA");
    expectRelClose(Number(pgen), expected, `${key} pgen ${pgen}`);
    expectRelClose(Number(neglog), -Math.log10(expected), `${key} neglog ${neglog}`);
  }
});
