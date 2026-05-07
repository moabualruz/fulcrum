import { describe, expect, test } from "bun:test";

import { clearTaskCustomField, setTaskCustomField } from "./commands.ts";
import { listCustomFieldDefs } from "./queries.ts";

describe("custom-field application boundary", () => {
  test("exports command and query entrypoints for tRPC delegation", () => {
    expect(clearTaskCustomField).toBeFunction();
    expect(setTaskCustomField).toBeFunction();
    expect(listCustomFieldDefs).toBeFunction();
  });
});
