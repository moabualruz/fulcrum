import { describe, expect, test } from "bun:test";

import {
  updateEnabledTaskTypes,
  updateMethodology,
  updateTransitions,
} from "./commands.ts";
import {
  getDefaultWorkflow,
  getEnabledTaskTypes,
  getMethodology,
  getTransitions,
  validateTransition,
} from "./queries.ts";

describe("workflow application boundary", () => {
  test("exports command and query entrypoints for tRPC delegation", () => {
    expect(updateEnabledTaskTypes).toBeFunction();
    expect(updateMethodology).toBeFunction();
    expect(updateTransitions).toBeFunction();
    expect(getDefaultWorkflow).toBeFunction();
    expect(getEnabledTaskTypes).toBeFunction();
    expect(getMethodology).toBeFunction();
    expect(getTransitions).toBeFunction();
    expect(validateTransition).toBeFunction();
  });
});
