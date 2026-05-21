import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id] +page.svelte source", () => {
  test("renders project quick-nav tabs to board/backlog/modules/intake/views/sprints/reports/repos/docs", () => {
    // Sections addressed under the project route tree.
    for (const segment of ["board", "backlog", "modules", "intake", "sprints", "reports", "repos"]) {
      expect(source).toContain(`/projects/${"${data.project.id}"}/${segment}`);
    }
    // Saved views live under the project settings sub-tree.
    expect(source).toContain(`/projects/${"${data.project.id}"}/settings/views`);
    // Docs is a workspace-level surface scoped via the project query param.
    expect(source).toContain(`/docs?project=${"${data.project.id}"}`);
    for (const label of ["Board", "Backlog", "Modules", "Intake", "Views", "Sprints", "Reports", "Repos", "Docs"]) {
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
