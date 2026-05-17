import { describe, expect, test } from "bun:test";

import {
  canTransition,
  getValidTransitions,
  resolveDependencyOrder,
  VALID_TRANSITIONS,
  type Column,
  type DependencyOrderTask,
} from "@execution-orchestration/domain/dependency-order.ts";

function createTask(id: string, dependencies: string[] = []): DependencyOrderTask {
  return {
    id,
    dependencies,
  };
}

describe("dependency orchestration dependency ordering", () => {
  test("allows all transitions defined in VALID_TRANSITIONS and rejects invalid transitions", () => {
    const allColumns: Column[] = ["triage", "todo", "in-progress", "in-review", "done", "archived"];

    for (const [from, validTos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of validTos) {
        expect(canTransition(from as Column, to)).toBe(true);
      }
    }

    expect(canTransition("done", "in-review")).toBe(false);
    expect(canTransition("archived", "in-progress")).toBe(false);
    expect(canTransition("triage", "done")).toBe(false);
    expect(canTransition("todo", "in-review")).toBe(false);

    for (const from of allColumns) {
      for (const to of allColumns) {
        if (!VALID_TRANSITIONS[from].includes(to)) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    }
  });

  test("returns transition copies so callers cannot mutate the source map", () => {
    const transitions = getValidTransitions("todo");
    transitions.push("archived");
    expect(getValidTransitions("todo")).toEqual(["in-progress", "triage"]);
  });

  test("matches dependency column transition contract", () => {
    expect(getValidTransitions("triage")).toEqual(["todo"]);
    expect(getValidTransitions("todo")).toEqual(["in-progress", "triage"]);
    expect(getValidTransitions("in-progress")).toEqual(["in-review", "todo", "triage", "done"]);
    expect(getValidTransitions("in-review")).toEqual(["done", "in-progress", "todo", "triage"]);
    expect(getValidTransitions("done")).toEqual(["todo", "triage", "archived"]);
    expect(getValidTransitions("archived")).toEqual(["done"]);
  });

  test("orders empty, single, linear, and partial dependency graphs", () => {
    expect(resolveDependencyOrder([])).toEqual([]);
    expect(resolveDependencyOrder([createTask("FN-001")])).toEqual(["FN-001"]);

    const linear = resolveDependencyOrder([
      createTask("FN-003", ["FN-002"]),
      createTask("FN-002", ["FN-001"]),
      createTask("FN-001"),
    ]);
    expect(linear.indexOf("FN-001")).toBeLessThan(linear.indexOf("FN-002"));
    expect(linear.indexOf("FN-002")).toBeLessThan(linear.indexOf("FN-003"));

    const partial = resolveDependencyOrder([
      createTask("FN-A", ["FN-B"]),
      createTask("FN-B"),
      createTask("FN-C"),
      createTask("FN-D"),
    ]);
    expect(partial.indexOf("FN-B")).toBeLessThan(partial.indexOf("FN-A"));
    expect(partial).toHaveLength(4);
  });

  test("orders diamond and complex graphs with all dependencies before dependents", () => {
    const diamond = resolveDependencyOrder([
      createTask("FN-D", ["FN-B", "FN-C"]),
      createTask("FN-C", ["FN-A"]),
      createTask("FN-B", ["FN-A"]),
      createTask("FN-A"),
    ]);

    expect(diamond.indexOf("FN-A")).toBeLessThan(diamond.indexOf("FN-B"));
    expect(diamond.indexOf("FN-A")).toBeLessThan(diamond.indexOf("FN-C"));
    expect(diamond.indexOf("FN-B")).toBeLessThan(diamond.indexOf("FN-D"));
    expect(diamond.indexOf("FN-C")).toBeLessThan(diamond.indexOf("FN-D"));

    const complex = resolveDependencyOrder([
      createTask("KB-E", ["FN-D"]),
      createTask("FN-D", ["FN-B", "FN-C"]),
      createTask("FN-C", ["FN-A"]),
      createTask("FN-B", ["FN-A"]),
      createTask("FN-A"),
    ]);
    expect(complex.indexOf("FN-A")).toBeLessThan(complex.indexOf("FN-B"));
    expect(complex.indexOf("FN-A")).toBeLessThan(complex.indexOf("FN-C"));
    expect(complex.indexOf("FN-B")).toBeLessThan(complex.indexOf("FN-D"));
    expect(complex.indexOf("FN-C")).toBeLessThan(complex.indexOf("FN-D"));
    expect(complex.indexOf("FN-D")).toBeLessThan(complex.indexOf("KB-E"));
    expect(complex).toHaveLength(5);
  });

  test("preserves disconnected tasks, cycles, self-dependencies, and deterministic order", () => {
    const disconnected = resolveDependencyOrder([createTask("FN-B"), createTask("FN-C"), createTask("FN-A")]);
    expect(disconnected).toEqual(["FN-B", "FN-C", "FN-A"]);

    const circular = resolveDependencyOrder([
      createTask("FN-A", ["FN-C"]),
      createTask("FN-B", ["FN-A"]),
      createTask("FN-C", ["FN-B"]),
    ]);
    expect(circular).toContain("FN-A");
    expect(circular).toContain("FN-B");
    expect(circular).toContain("FN-C");
    expect(circular).toHaveLength(3);

    const selfReferential = resolveDependencyOrder([createTask("FN-A", ["FN-A"]), createTask("FN-B")]);
    expect(selfReferential).toContain("FN-A");
    expect(selfReferential).toContain("FN-B");
    expect(selfReferential).toHaveLength(2);

    const repeatedInput = [createTask("FN-A"), createTask("FN-B", ["FN-A"]), createTask("FN-C", ["FN-A"])];
    expect(resolveDependencyOrder(repeatedInput)).toEqual(resolveDependencyOrder(repeatedInput));
  });
});
