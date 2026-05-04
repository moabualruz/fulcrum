/**
 * Vitest tests for ExperimentStore.
 * RED → GREEN via TDD.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { ExperimentStore } from "./experiments.ts";
import { bucketFor } from "./evaluation.ts";

describe("ExperimentStore", () => {
  let store: ExperimentStore;

  beforeEach(() => {
    store = new ExperimentStore();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe("create", () => {
    test("creates experiment with required fields", () => {
      const exp = store.create({ name: "btn-color", variants: ["blue", "red"] });
      expect(exp.name).toBe("btn-color");
      expect(exp.variants).toEqual(["blue", "red"]);
      expect(exp.rolloutPercent).toBe(100);
      expect(exp.id).toMatch(/^exp-/);
    });

    test("stores and retrieves by id", () => {
      const exp = store.create({ name: "x", variants: ["a", "b"] });
      expect(store.get(exp.id)).toEqual(exp);
    });

    test("stores and retrieves by name", () => {
      const exp = store.create({ name: "my-exp", variants: ["a"] });
      expect(store.getByName("my-exp")).toEqual(exp);
    });

    test("list returns all experiments", () => {
      store.create({ name: "e1", variants: ["a"] });
      store.create({ name: "e2", variants: ["b"] });
      expect(store.list()).toHaveLength(2);
    });

    test("respects rolloutPercent", () => {
      const exp = store.create({ name: "partial", variants: ["a"], rolloutPercent: 50 });
      expect(exp.rolloutPercent).toBe(50);
    });
  });

  // ── assign ──────────────────────────────────────────────────────────────────

  describe("assign", () => {
    test("returns null for unknown experiment", () => {
      expect(store.assign("unknown", "user-1")).toBeNull();
    });

    test("assigns user to a valid variant", () => {
      const exp = store.create({ name: "test", variants: ["A", "B"] });
      const assignment = store.assign(exp.id, "user-1");
      expect(assignment).not.toBeNull();
      expect(["A", "B"]).toContain(assignment!.variant);
    });

    test("assignment is idempotent (same variant on repeat calls)", () => {
      const exp = store.create({ name: "idem", variants: ["X", "Y"] });
      const a1 = store.assign(exp.id, "user-42");
      const a2 = store.assign(exp.id, "user-42");
      expect(a1).toEqual(a2);
    });

    test("different users get potentially different variants", () => {
      const exp = store.create({ name: "dist", variants: ["A", "B"], rolloutPercent: 100 });
      const variants = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const a = store.assign(exp.id, `user-${i}`);
        if (a) variants.add(a.variant);
      }
      // With 50 users there should be both variants
      expect(variants.size).toBe(2);
    });

    test("rollout=0 → no user gets assigned", () => {
      const exp = store.create({ name: "off", variants: ["A", "B"], rolloutPercent: 0 });
      for (let i = 0; i < 20; i++) {
        expect(store.assign(exp.id, `user-${i}`)).toBeNull();
      }
    });

    test("rollout=100 → all users get assigned", () => {
      const exp = store.create({ name: "full", variants: ["A", "B"], rolloutPercent: 100 });
      for (let i = 0; i < 20; i++) {
        expect(store.assign(exp.id, `user-${i}`)).not.toBeNull();
      }
    });
  });

  // ── assignment distribution (acceptance criterion) ─────────────────────────

  describe("assignment distribution at 50% rollout", () => {
    test("100 users with rollout=50 → ~50 assigned, ~25 each variant", () => {
      const exp = store.create({ name: "ab-50", variants: ["blue", "red"], rolloutPercent: 50 });
      let assigned = 0;
      const counts: Record<string, number> = { blue: 0, red: 0 };
      for (let i = 0; i < 100; i++) {
        const a = store.assign(exp.id, `user-${i}`);
        if (a) {
          assigned++;
          counts[a.variant]!++;
        }
      }
      // ~50% enrolled
      expect(assigned).toBeGreaterThanOrEqual(30);
      expect(assigned).toBeLessThanOrEqual(70);
      // each variant should have some
      expect(counts["blue"]!).toBeGreaterThan(5);
      expect(counts["red"]!).toBeGreaterThan(5);
    });

    test("100 users with rollout=100 → ~50 each variant", () => {
      const exp = store.create({ name: "ab-100", variants: ["blue", "red"], rolloutPercent: 100 });
      const counts: Record<string, number> = { blue: 0, red: 0 };
      for (let i = 0; i < 100; i++) {
        const a = store.assign(exp.id, `user-${i}`);
        if (a) counts[a.variant]!++;
      }
      // Distribution should be roughly even (within 20 of center)
      expect(Math.abs(counts["blue"]! - counts["red"]!)).toBeLessThan(30);
    });
  });

  // ── assignments() query ────────────────────────────────────────────────────

  describe("assignments()", () => {
    test("returns empty object when no assignments", () => {
      const exp = store.create({ name: "empty", variants: ["A"] });
      expect(store.assignments(exp.id)).toEqual({});
    });

    test("counts per variant", () => {
      const exp = store.create({ name: "count", variants: ["A", "B"], rolloutPercent: 100 });
      for (let i = 0; i < 100; i++) {
        store.assign(exp.id, `user-${i}`);
      }
      const counts = store.assignments(exp.id);
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      expect(total).toBe(100);
      expect(Object.keys(counts).sort()).toEqual(["A", "B"].sort());
    });
  });

  // ── metrics() ─────────────────────────────────────────────────────────────

  describe("metrics()", () => {
    test("returns zero counts for experiment with no assignments", () => {
      const exp = store.create({ name: "m-empty", variants: ["A", "B"] });
      const m = store.metrics(exp.id, "task.created");
      expect(m["A"]).toEqual({ assigned: 0, conversions: 0 });
      expect(m["B"]).toEqual({ assigned: 0, conversions: 0 });
    });

    test("returns empty object for unknown experimentId", () => {
      expect(store.metrics("bogus", "event")).toEqual({});
    });

    test("counts conversions per variant", () => {
      const exp = store.create({ name: "m-conv", variants: ["ctrl", "treat"], rolloutPercent: 100 });
      for (let i = 0; i < 10; i++) {
        const a = store.assign(exp.id, `user-${i}`);
        if (a?.variant === "treat") {
          store.recordConversion(exp.id, `user-${i}`, "task.created");
        }
      }
      const m = store.metrics(exp.id, "task.created");
      expect(m["treat"]!.conversions).toBeGreaterThan(0);
      expect(m["ctrl"]!.conversions).toBe(0);
    });

    test("only counts matching conversionKind", () => {
      const exp = store.create({ name: "m-kind", variants: ["A"], rolloutPercent: 100 });
      store.assign(exp.id, "user-1");
      store.recordConversion(exp.id, "user-1", "task.created");
      const m1 = store.metrics(exp.id, "task.created");
      const m2 = store.metrics(exp.id, "task.deleted");
      expect(m1["A"]!.conversions).toBe(1);
      expect(m2["A"]!.conversions).toBe(0);
    });
  });
});
