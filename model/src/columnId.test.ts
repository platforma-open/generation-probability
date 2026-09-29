import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { columnIdFromPlRef, plRefFromColumnId } from "./index";

const ref: PlRef = {
  __isRef: true,
  blockId: "08338940-9da6-43ba-a02b-4df15a120ee4",
  name: "clonotypes.clonotypeProperties/abundance/IG/cell-count",
};

// What the result pool uses as a column id: the PlRef's canonical JSON, keys sorted.
const poolId =
  '{"__isRef":true,"blockId":"08338940-9da6-43ba-a02b-4df15a120ee4","name":"clonotypes.clonotypeProperties/abundance/IG/cell-count"}';

describe("column id <-> PlRef", () => {
  test("builds the pool's own id, so existing blocks' args.inputAnchor stays byte-identical", () => {
    expect(columnIdFromPlRef(ref)).toBe(poolId);
  });

  test("an id stored before the dataset became a PlRef parses back to the same ref", () => {
    expect(plRefFromColumnId(poolId)).toEqual(ref);
  });

  test("round-trips", () => {
    expect(columnIdFromPlRef(plRefFromColumnId(columnIdFromPlRef(ref))!)).toBe(poolId);
  });

  test("drops requireEnrichments, which is not part of the pool id", () => {
    expect(columnIdFromPlRef({ ...ref, requireEnrichments: true })).toBe(poolId);
  });

  test.for([
    { id: undefined, why: "nothing stored" },
    { id: "not json", why: "not JSON" },
    { id: '{"blockId":"b","name":"n"}', why: "not a PlRef (no __isRef)" },
    { id: '["b","n"]', why: "a JSON array" },
  ])("$why -> undefined", ({ id }) => {
    expect(plRefFromColumnId(id)).toBeUndefined();
  });
});
