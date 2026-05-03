import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id] +page.svelte source", () => {
  test("renders project quick-nav tabs to board/backlog/sprints/reports/repos/docs", () => {
    for (const segment of ["board", "backlog", "sprints", "reports", "repos", "docs"]) {
      expect(source).toContain(`/projects/${"${data.project.id}"}/${segment}`);
    }
    for (const label of ["Board", "Backlog", "Sprints", "Reports", "Repos", "Docs"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });

  test("renders summary metrics from load data", () => {
    for (const key of ["openTasks", "inProgress", "done", "sprintDaysRemaining"]) {
      expect(source).toContain(`data.summary.${key}`);
      expect(source).toContain(`data-project-summary={item.key}`);
    }
  });
});
