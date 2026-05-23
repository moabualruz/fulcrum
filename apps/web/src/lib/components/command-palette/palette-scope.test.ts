import { describe, expect, test } from "bun:test";

import {
  deriveRouteScope,
  projectIdFromPath,
  withStepScope,
} from "./palette-scope.ts";

describe("projectIdFromPath", () => {
  test("extracts the project id from a /projects/<id> path", () => {
    expect(projectIdFromPath("/projects/auth-rewrite/board")).toBe("auth-rewrite");
  });

  test("returns null when the path has no project segment", () => {
    expect(projectIdFromPath("/runs")).toBeNull();
    expect(projectIdFromPath("/")).toBeNull();
  });
});

describe("deriveRouteScope", () => {
  test("maps the Capture root route to the capture stage", () => {
    const scope = deriveRouteScope({ pathname: "/" });
    expect(scope.stage).toBe("capture");
    expect(scope.workspace).toBe("fulcrum");
    expect(scope.step).toBeNull();
  });

  test("maps a planning route to the plan stage", () => {
    expect(deriveRouteScope({ pathname: "/planning" }).stage).toBe("plan");
    expect(deriveRouteScope({ pathname: "/plan-session" }).stage).toBe("plan");
  });

  test("prefers the layout-supplied active project id over the path", () => {
    const scope = deriveRouteScope({
      pathname: "/projects/from-path/board",
      activeProjectId: "from-layout",
    });
    expect(scope.projectId).toBe("from-layout");
  });

  test("falls back to the path project id when the layout supplies none", () => {
    const scope = deriveRouteScope({ pathname: "/projects/path-only/docs" });
    expect(scope.projectId).toBe("path-only");
  });

  test("the result set changes when the route changes (Scope-aware)", () => {
    const plan = deriveRouteScope({ pathname: "/planning" });
    const build = deriveRouteScope({ pathname: "/build-board" });
    expect(plan.stage).not.toBe(build.stage);
  });
});

describe("withStepScope", () => {
  test("returns the base Scope unchanged when no Step is supplied", () => {
    const base = deriveRouteScope({ pathname: "/plan-session" });
    expect(withStepScope(base, null).step).toBeNull();
  });

  test("layers a Step onto the Scope and lifts the Step trace id", () => {
    const base = deriveRouteScope({ pathname: "/plan-session" });
    const scoped = withStepScope(base, {
      stepId: "AUTH-3",
      kind: "task-card",
      title: "Persist issuance row per kid",
      traceId: "tr_8f29a4c1b3e0d5f7",
      index: 3,
      total: 8,
    });
    expect(scoped.step?.stepId).toBe("AUTH-3");
    expect(scoped.traceId).toBe("tr_8f29a4c1b3e0d5f7");
  });
});
