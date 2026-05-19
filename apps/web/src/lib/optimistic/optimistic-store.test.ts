import { describe, expect, test } from "bun:test";
import { OptimisticStore, OptimisticDeletionQueue } from "./optimistic-store.ts";

describe("OptimisticStore", () => {
  test("apply inserts a pending entry and notifies subscribers", () => {
    const store = new OptimisticStore<{ title: string }>();
    const seen: number[] = [];
    store.subscribe((entries) => seen.push(entries.length));

    store.apply("task-1", { title: "Persist refresh-token rotation" });

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.status).toBe("pending");
    expect(store.list()[0]?.value.title).toBe("Persist refresh-token rotation");
    expect(seen).toEqual([0, 1]);
  });

  test("confirm transitions a pending entry to confirmed and preserves traceId", () => {
    const store = new OptimisticStore<{ title: string }>();
    const handle = store.apply("task-1", { title: "Add kid index" });

    handle.confirm({ traceId: "tr_abc123" });

    const entry = store.list()[0];
    expect(entry?.status).toBe("confirmed");
    expect(entry?.traceId).toBe("tr_abc123");
    expect(entry?.error).toBeUndefined();
  });

  test("fail transitions a pending entry to failed and records the error + traceId", () => {
    const store = new OptimisticStore<{ title: string }>();
    const handle = store.apply("task-1", { title: "Add kid index" });

    handle.fail({ message: "schema review pending", traceId: "tr_fail_42" });

    const entry = store.list()[0];
    expect(entry?.status).toBe("failed");
    expect(entry?.error).toBe("schema review pending");
    expect(entry?.traceId).toBe("tr_fail_42");
  });

  test("rollback removes the entry entirely (silent revert without user-visible reason is forbidden -- caller must inline-render error first)", () => {
    const store = new OptimisticStore<{ title: string }>();
    const handle = store.apply("task-1", { title: "Add kid index" });

    handle.rollback();

    expect(store.list()).toHaveLength(0);
  });

  test("retry resets a failed entry back to pending with a fresh value", () => {
    const store = new OptimisticStore<{ title: string }>();
    const handle = store.apply("task-1", { title: "Old title" });
    handle.fail({ message: "500" });

    store.retry("task-1", { title: "New title" });

    const entry = store.list()[0];
    expect(entry?.status).toBe("pending");
    expect(entry?.value.title).toBe("New title");
    expect(entry?.error).toBeUndefined();
  });

  test("apply with the same id replaces the previous entry (idempotent retry)", () => {
    const store = new OptimisticStore<{ title: string }>();
    store.apply("task-1", { title: "first" });
    store.apply("task-1", { title: "second" });

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.value.title).toBe("second");
  });

  test("subscribers can unsubscribe", () => {
    const store = new OptimisticStore<{ title: string }>();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((entries) => seen.push(entries.length));

    unsubscribe();
    store.apply("task-1", { title: "x" });

    expect(seen).toEqual([0]);
  });
});

describe("OptimisticDeletionQueue", () => {
  test("schedule registers a pending deletion with the configured window", () => {
    let now = 1_000;
    const queue = new OptimisticDeletionQueue<string>({
      windowMs: 30_000,
      clock: () => now,
    });

    queue.schedule("task-1");

    const pending = queue.list();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.expiresAt).toBe(31_000);
    expect(pending[0]?.remainingMs).toBe(30_000);

    now = 21_000;
    expect(queue.list()[0]?.remainingMs).toBe(10_000);

    now = 100_000;
    expect(queue.list()[0]?.remainingMs).toBe(0);
  });

  test("undo removes the pending deletion (inline affordance triggered)", () => {
    const queue = new OptimisticDeletionQueue<string>();
    queue.schedule("task-1");

    const undid = queue.undo("task-1");

    expect(undid).toBe(true);
    expect(queue.list()).toHaveLength(0);
  });

  test("undo returns false for an unknown key", () => {
    const queue = new OptimisticDeletionQueue<string>();
    expect(queue.undo("missing")).toBe(false);
  });

  test("finalize removes the pending deletion after the window elapses (caller drives expiration)", () => {
    const queue = new OptimisticDeletionQueue<string>();
    queue.schedule("task-1");

    expect(queue.finalize("task-1")).toBe(true);
    expect(queue.list()).toHaveLength(0);
  });

  test("subscribers receive a snapshot on every state change", () => {
    let now = 0;
    const queue = new OptimisticDeletionQueue<string>({ clock: () => now });
    const snapshots: number[] = [];
    queue.subscribe((items) => snapshots.push(items.length));

    queue.schedule("task-1");
    queue.schedule("task-2");
    queue.undo("task-1");

    expect(snapshots).toEqual([0, 1, 2, 1]);
  });
});
