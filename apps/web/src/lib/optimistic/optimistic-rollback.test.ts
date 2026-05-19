import { describe, expect, test } from "bun:test";
import {
  OptimisticRollback,
  ROLLBACK_ESCALATION_THRESHOLD,
  ROLLBACK_SUGGESTED_ACTIONS,
  ROLLBACK_TROUBLESHOOTING_HREF,
  ROLLBACK_TROUBLESHOOTING_LABEL,
} from "./optimistic-rollback.ts";

describe("OptimisticRollback", () => {
  test("records the first failure as a non-escalated entry with the supplied error + trace + payload", () => {
    const rollback = new OptimisticRollback();
    const entry = rollback.recordFailure({
      id: "task-1",
      error: "Server rejected the mutation (HTTP 500).",
      traceId: "tr_optimistic_5xx",
      payload: { title: "Persist refresh-token rotation" },
    });
    expect(entry.attempts).toBe(1);
    expect(entry.escalated).toBe(false);
    expect(entry.lastError).toBe("Server rejected the mutation (HTTP 500).");
    expect(entry.lastTraceId).toBe("tr_optimistic_5xx");
    expect(entry.lastPayload).toEqual({ title: "Persist refresh-token rotation" });
  });

  test("escalates on the third consecutive failure (default threshold = 3)", () => {
    const rollback = new OptimisticRollback();
    rollback.recordFailure({ id: "task-1", error: "500" });
    rollback.recordFailure({ id: "task-1", error: "500" });
    const third = rollback.recordFailure({ id: "task-1", error: "500" });
    expect(third.attempts).toBe(3);
    expect(third.escalated).toBe(true);
    expect(ROLLBACK_ESCALATION_THRESHOLD).toBe(3);
  });

  test("threshold is configurable", () => {
    const rollback = new OptimisticRollback({ threshold: 2 });
    rollback.recordFailure({ id: "task-1", error: "500" });
    const second = rollback.recordFailure({ id: "task-1", error: "500" });
    expect(second.escalated).toBe(true);
  });

  test("resolve / clear removes the failure record and notifies subscribers", () => {
    const rollback = new OptimisticRollback();
    const snapshots: number[] = [];
    rollback.subscribe((failures) => snapshots.push(failures.length));

    rollback.recordFailure({ id: "task-1", error: "500" });
    rollback.recordFailure({ id: "task-2", error: "500" });
    rollback.resolve("task-1");
    rollback.clear("task-2");
    rollback.clear("missing");

    expect(snapshots).toEqual([0, 1, 2, 1, 0]);
    expect(rollback.list()).toHaveLength(0);
  });

  test("get returns the latest failure record for an id", () => {
    const rollback = new OptimisticRollback();
    rollback.recordFailure({ id: "task-1", error: "first" });
    rollback.recordFailure({ id: "task-1", error: "second", traceId: "tr_2" });
    const got = rollback.get("task-1");
    expect(got?.attempts).toBe(2);
    expect(got?.lastError).toBe("second");
    expect(got?.lastTraceId).toBe("tr_2");
  });

  test("troubleshooting copy never says 'Contact support' (matrix rejected)", () => {
    expect(ROLLBACK_TROUBLESHOOTING_LABEL.toLowerCase()).not.toContain("contact support");
    expect(ROLLBACK_TROUBLESHOOTING_HREF).toMatch(/troubleshooting/);
    for (const action of ROLLBACK_SUGGESTED_ACTIONS) {
      expect(action.toLowerCase()).not.toContain("contact support");
    }
  });

  test("subscribers can unsubscribe", () => {
    const rollback = new OptimisticRollback();
    const snapshots: number[] = [];
    const unsubscribe = rollback.subscribe((failures) => snapshots.push(failures.length));
    unsubscribe();
    rollback.recordFailure({ id: "task-1", error: "500" });
    expect(snapshots).toEqual([0]);
  });
});
