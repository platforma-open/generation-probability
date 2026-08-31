import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { isColumnUniversalId } from "@platforma-sdk/model";
import { name, version } from "../package.json" with { type: "json" };

// The two species the Pgen models are trained for. Lives here rather than in the
// model so the init-params contract and the UI dropdown cannot name different
// sets; the model re-exports it for the UI.
export const SPECIES_OPTIONS = [
  { label: "Human", value: "human" },
  { label: "Mouse", value: "mouse" },
] as const;

export type Species = (typeof SPECIES_OPTIONS)[number]["value"];

const SPECIES_VALUES: readonly string[] = SPECIES_OPTIONS.map((option) => option.value);

/**
 * This block's init-params contract — the dataset to score and the species whose
 * generation model scores it. Both are what `.args()` requires, so they are the
 * whole of what a template configures.
 *
 * Left out: `datasetLabel`, which the UI derives from the picked option's label,
 * and the table / distribution-chart view state.
 *
 * Both fields are optional because the projection hands live state back
 * untouched, and a block whose dataset or species is not picked yet holds
 * `undefined` there. Requiring either would make the block export a file its own
 * kind refuses to apply, so export and apply would stop being inverses.
 */
export type BlockParams = {
  /**
   * A column id, as produced by `deriveColumnOptions`. Declared `string` to
   * match the model's `BlockData`; the parser still checks it is a real column
   * id, which every value the picker can produce is.
   */
  inputAnchor?: string;
  species?: Species;
};

/** The same contract at runtime, for params arriving from a template file rather than typed code. */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const { inputAnchor, species } = value;

  if (inputAnchor !== undefined && !isColumnUniversalId(inputAnchor)) {
    throw new Error("'inputAnchor' must be a column id.");
  }
  if (species !== undefined && !SPECIES_VALUES.includes(species as string)) {
    throw new Error(`'species' must be one of: ${SPECIES_VALUES.join(", ")}.`);
  }

  return { inputAnchor, species: species as Species | undefined };
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({ name, version, parseInitializationParams });
