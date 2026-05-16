import { describe, expect, test } from "bun:test";

import { buildPlanningArtifactPreviews } from "@planning-review/application/artifact-preview.ts";

describe("planning artifact previews", () => {
  test("classifies prototype and boilerplate artifacts into reviewable preview/run metadata", () => {
    const previews = buildPlanningArtifactPreviews({
      artifacts: [
        {
          kind: "prototype",
          path: "apps/web/src/routes/planning/+page.svelte",
          sourcePlanId: "technical-plan",
          traceId: "trace-1",
        },
        {
          kind: "prototype",
          path: "apps/web/src/routes/planning/workbench-prototype.tsx",
          sourcePlanId: "technical-plan",
          traceId: "trace-1",
        },
        {
          kind: "boilerplate",
          path: "services/planning-review/src/application/technical-planning-cycle.ts",
          sourcePlanId: "technical-plan",
          traceId: "trace-1",
        },
        {
          kind: "boilerplate",
          path: "tests/planning-review/technical-planning-cycle.test.ts",
        },
      ],
    });

    expect(previews.map((preview) => ({
      kind: preview.kind,
      path: preview.path,
      mode: preview.mode,
      urlPath: preview.urlPath,
      run: preview.run,
    }))).toEqual([
      {
        kind: "prototype",
        path: "apps/web/src/routes/planning/+page.svelte",
        mode: "web-route",
        urlPath: "/planning",
        run: { command: "bun", args: ["run", "--cwd", "apps/web", "test"] },
      },
      {
        kind: "prototype",
        path: "apps/web/src/routes/planning/workbench-prototype.tsx",
        mode: "source-module",
        urlPath: undefined,
        run: {
          command: "bun",
          args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
        },
      },
      {
        kind: "boilerplate",
        path: "services/planning-review/src/application/technical-planning-cycle.ts",
        mode: "source-module",
        urlPath: undefined,
        run: {
          command: "bun",
          args: ["-e", 'await import("./services/planning-review/src/application/technical-planning-cycle.ts")'],
        },
      },
      {
        kind: "boilerplate",
        path: "tests/planning-review/technical-planning-cycle.test.ts",
        mode: "test-file",
        urlPath: undefined,
        run: { command: "bun", args: ["test", "tests/planning-review/technical-planning-cycle.test.ts"] },
      },
    ]);
    expect(previews[0]?.reviewChecks.join("\n")).toContain("Prototype demonstrates the intended user flow");
    expect(previews[2]?.reviewChecks.join("\n")).toContain("Boilerplate can be imported or tested");
  });
});
