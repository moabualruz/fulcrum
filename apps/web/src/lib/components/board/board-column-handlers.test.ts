import { describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import { diffMoveFromBoard } from "./board-column-handlers.ts";

const t = (id: string, status: BoardTask["status"], priority = 1): BoardTask => ({
  id,
  title: `task ${id}`,
  status,
  priority,
  project_id: null,
  updated_at: "",
});

describe("diffMoveFromBoard", () => {
  test("returns move payload when a task arrived from another column", () => {
    const before: BoardTask[] = [
      t("a", "pending"),
      t("b", "in_progress"),
      t("c", "in_progress"),
    ];
    const afterColumn: BoardTask[] = [t("b", "pending"), t("a", "pending")];
    expect(diffMoveFromBoard(before, afterColumn, "pending")).toEqual({
      taskId: "b",
      fromStatus: "in_progress",
      toStatus: "pending",
    });
  });

  test("returns null when all tasks already belong to the target column", () => {
    const before: BoardTask[] = [t("a", "pending"), t("b", "pending")];
    const afterColumn: BoardTask[] = [t("b", "pending"), t("a", "pending")];
    expect(diffMoveFromBoard(before, afterColumn, "pending")).toBeNull();
  });

  test("returns null when the column is empty after the drag", () => {
    const before: BoardTask[] = [t("a", "pending")];
    expect(diffMoveFromBoard(before, [], "pending")).toBeNull();
  });

  test("returns the lexicographically first id when multiple tasks differ", () => {
    const before: BoardTask[] = [
      t("alpha", "in_progress"),
      t("beta", "blocked"),
      t("zed", "pending"),
    ];
    const afterColumn: BoardTask[] = [
      t("zed", "pending"),
      t("beta", "pending"),
      t("alpha", "pending"),
    ];
    expect(diffMoveFromBoard(before, afterColumn, "pending")).toEqual({
      taskId: "alpha",
      fromStatus: "in_progress",
      toStatus: "pending",
    });
  });

  test("returns null when an unknown task appears in afterColumn (defensive)", () => {
    const before: BoardTask[] = [t("a", "pending")];
    const afterColumn: BoardTask[] = [t("ghost", "pending")];
    expect(diffMoveFromBoard(before, afterColumn, "pending")).toBeNull();
  });
});
