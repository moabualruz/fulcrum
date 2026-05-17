import { describe, expect, test } from "bun:test";

import { createAutomation, deleteAutomation, updateAutomation } from "@work-management/application/automations/commands.ts";
import { getAutomationTemplates, listAutomations } from "@work-management/application/automations/queries.ts";

describe("automation application boundary", () => {
  test("exports command and query entrypoints for tRPC delegation", () => {
    expect(createAutomation).toBeFunction();
    expect(updateAutomation).toBeFunction();
    expect(deleteAutomation).toBeFunction();
    expect(listAutomations).toBeFunction();
    expect(getAutomationTemplates).toBeFunction();
  });
});
