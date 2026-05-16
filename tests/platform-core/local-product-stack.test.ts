import { describe, expect, test } from "bun:test";

import { localReadinessStatusSchema, resetPlanForFulcrumHome } from "@platform-core/application/init/local-state.ts";

describe("Workflow local startup contract", () => {
  test("readiness status distinguishes pass, repairable, and reset-required", () => {
    expect(localReadinessStatusSchema.options).toEqual(["pass", "repairable", "reset-required"]);
  });

  test("reset plan requires explicit confirmation and names FULCRUM_HOME", () => {
    const plan = resetPlanForFulcrumHome("/tmp/fulcrum-home", { confirm: false });

    expect(plan.status).toBe("reset-required");
    expect(plan.fulcrumHome).toBe("/tmp/fulcrum-home");
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredFlag).toBe("--yes-reset-local-state");
  });
});
