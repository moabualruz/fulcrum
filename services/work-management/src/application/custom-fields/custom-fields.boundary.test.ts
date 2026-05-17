import { describe, expect, test } from "bun:test";

import { clearTaskCustomField, setTaskCustomField } from "@work-management/application/custom-fields/commands.ts";
import { listCustomFieldDefs } from "@work-management/application/custom-fields/queries.ts";

describe("custom-field application boundary", () => {
  test("exports command and query entrypoints for tRPC delegation", () => {
    expect(clearTaskCustomField).toBeFunction();
    expect(setTaskCustomField).toBeFunction();
    expect(listCustomFieldDefs).toBeFunction();
  });
});
