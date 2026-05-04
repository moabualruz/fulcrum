import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/board +page.svelte source", () => {
  test("renders swimlane toggle and sprint filter chip", () => {
    expect(source).toContain("data-swimlane-toggle");
    expect(source).toContain("data-sprint-filter-chip");
    expect(source).toContain("data.sprintFilter");
    expect(source).toContain("/projects/${data.projectId}/board");
  });

  test("renders project-scoped kanban columns and card mini-view via shared BoardCard", () => {
    expect(source).toContain("data-project-board-grid");
    expect(source).toContain("BoardColumn");
    expect(source).toContain("TASK_STATUSES");
    const cardSource = readFileSync(
      new URL("../../../../lib/components/board/BoardCard.svelte", import.meta.url),
      "utf8",
    );
    for (const hook of [
      "data-board-card-priority",
      "data-board-card-assignee",
      "data-board-card-due-date",
      "data-board-card-estimate",
    ]) {
      expect(cardSource).toContain(hook);
    }
  });
});
