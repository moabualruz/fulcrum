import { describe, expect, test } from "bun:test";
import {
  buildBoardSnapshot,
  describeStatus,
  keyboardMove,
  optimisticMove,
} from "./board-helpers.ts";
import type { BoardTask } from "$lib/product-queries";
import { TASK_STATUSES, type TaskStatus } from "$lib/server/tasks";

function task(
  id: string,
  status: TaskStatus,
  priority: number,
  updated_at: string,
  title = `Task ${id}`,
): BoardTask {
  return { id, title, status, priority, project_id: null, updated_at };
}

const sample: BoardTask[] = [
  task("a", "pending", 5, "2026-04-01T10:00:00Z", "Wire UI"),
  task("b", "pending", 1, "2026-04-02T10:00:00Z", "Ship docs"),
  task("c", "in_progress", 3, "2026-04-03T10:00:00Z", "Refactor"),
  task("d", "in_progress", 3, "2026-04-04T10:00:00Z", "Tests"),
  task("e", "blocked", 0, "2026-04-05T10:00:00Z", "Stuck"),
  task("f", "completed", 0, "2026-04-06T10:00:00Z", "Done"),
  task("g", "cancelled", 0, "2026-04-07T10:00:00Z", "Nope"),
];

describe("buildBoardSnapshot", () => {
  test("groups tasks into the five canonical columns", () => {
    const snap = buildBoardSnapshot(sample);
    for (const status of TASK_STATUSES) {
      expect(Array.isArray(snap.groups[status])).toBe(true);
    }
    expect(snap.groups.pending.map((t) => t.id)).toEqual(["a", "b"]);
    expect(snap.groups.in_progress.map((t) => t.id)).toEqual(["d", "c"]);
    expect(snap.groups.blocked.map((t) => t.id)).toEqual(["e"]);
    expect(snap.groups.completed.map((t) => t.id)).toEqual(["f"]);
    expect(snap.groups.cancelled.map((t) => t.id)).toEqual(["g"]);
  });

  test("sorts by priority DESC, updated_at DESC, id ASC", () => {
    const tasks: BoardTask[] = [
      task("a", "pending", 1, "2026-04-01T10:00:00Z"),
      task("b", "pending", 5, "2026-04-01T10:00:00Z"),
      task("c", "pending", 5, "2026-04-02T10:00:00Z"),
      task("d", "pending", 5, "2026-04-02T10:00:00Z"),
    ];
    const snap = buildBoardSnapshot(tasks);
    // Priority 5 first; among priority-5 newer updated_at first; tie-break id ASC.
    expect(snap.groups.pending.map((t) => t.id)).toEqual(["c", "d", "b", "a"]);
  });

  test("ignores tasks whose status is not in TASK_STATUSES", () => {
    const tasks: BoardTask[] = [
      task("a", "pending", 1, "2026-04-01T10:00:00Z"),
      { id: "z", title: "ghost", status: "garbage", priority: 0, project_id: null, updated_at: "2026-04-01T10:00:00Z" },
    ];
    const snap = buildBoardSnapshot(tasks);
    expect(snap.groups.pending.map((t) => t.id)).toEqual(["a"]);
    for (const status of TASK_STATUSES) {
      expect(snap.groups[status].some((t) => t.id === "z")).toBe(false);
    }
  });
});

describe("optimisticMove", () => {
  test("appends the card to the END of the target column", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, from } = optimisticMove(snap, "a", "in_progress");
    expect(from).toBe("pending");
    expect(next).not.toBe(snap);
    expect(next.groups.pending.map((t) => t.id)).toEqual(["b"]);
    const ip = next.groups.in_progress.map((t) => t.id);
    expect(ip[ip.length - 1]).toBe("a");
    expect(ip).toEqual(["d", "c", "a"]);
  });

  test("same column → identity (next === snapshot)", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, from } = optimisticMove(snap, "a", "pending");
    expect(next).toBe(snap);
    expect(from).toBe("pending");
  });

  test("unknown task → identity, from === null", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, from } = optimisticMove(snap, "missing", "in_progress");
    expect(next).toBe(snap);
    expect(from).toBeNull();
  });

  test("preserves the order of untouched cards in source column", () => {
    const snap = buildBoardSnapshot(sample);
    const { next } = optimisticMove(snap, "c", "blocked");
    expect(next.groups.in_progress.map((t) => t.id)).toEqual(["d"]);
    expect(next.groups.blocked.map((t) => t.id)).toEqual(["e", "c"]);
  });
});

describe("keyboardMove", () => {
  test("ArrowUp without modifier swaps with previous in column", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "c", { key: "ArrowUp", withMod: false });
    expect(next.groups.in_progress.map((t) => t.id)).toEqual(["c", "d"]);
    expect(description).toBeTruthy();
  });

  test("ArrowUp on the first card → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "d", { key: "ArrowUp", withMod: false });
    expect(next).toBe(snap);
    expect(description).toBeNull();
  });

  test("ArrowDown swaps with next", () => {
    const snap = buildBoardSnapshot(sample);
    const { next } = keyboardMove(snap, "d", { key: "ArrowDown", withMod: false });
    expect(next.groups.in_progress.map((t) => t.id)).toEqual(["c", "d"]);
  });

  test("ArrowDown on the last card → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "c", { key: "ArrowDown", withMod: false });
    expect(next).toBe(snap);
    expect(description).toBeNull();
  });

  test("Cmd+Right moves to next column (pending → in_progress)", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "a", { key: "ArrowRight", withMod: true });
    expect(next.groups.pending.map((t) => t.id)).toEqual(["b"]);
    expect(next.groups.in_progress.map((t) => t.id)).toEqual(["d", "c", "a"]);
    expect(description).toBe("Moved 'Wire UI' from Pending to In progress.");
  });

  test("Cmd+Right on last column (cancelled) → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "g", { key: "ArrowRight", withMod: true });
    expect(next).toBe(snap);
    expect(description).toBeNull();
  });

  test("Cmd+Left moves card backward (in_progress → pending)", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "c", { key: "ArrowLeft", withMod: true });
    expect(next.groups.in_progress.map((t) => t.id)).toEqual(["d"]);
    expect(next.groups.pending.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(description).toBe("Moved 'Refactor' from In progress to Pending.");
  });

  test("Cmd+Left on first column (pending) → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "a", { key: "ArrowLeft", withMod: true });
    expect(next).toBe(snap);
    expect(description).toBeNull();
  });

  test("ArrowLeft / ArrowRight without modifier → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const left = keyboardMove(snap, "c", { key: "ArrowLeft", withMod: false });
    const right = keyboardMove(snap, "c", { key: "ArrowRight", withMod: false });
    expect(left.next).toBe(snap);
    expect(left.description).toBeNull();
    expect(right.next).toBe(snap);
    expect(right.description).toBeNull();
  });

  test("unknown task id → no-op", () => {
    const snap = buildBoardSnapshot(sample);
    const { next, description } = keyboardMove(snap, "missing", { key: "ArrowUp", withMod: false });
    expect(next).toBe(snap);
    expect(description).toBeNull();
  });
});

describe("describeStatus", () => {
  test("renders human labels for every TaskStatus", () => {
    expect(describeStatus("pending")).toBe("Pending");
    expect(describeStatus("in_progress")).toBe("In progress");
    expect(describeStatus("blocked")).toBe("Blocked");
    expect(describeStatus("completed")).toBe("Completed");
    expect(describeStatus("cancelled")).toBe("Cancelled");
  });
});
