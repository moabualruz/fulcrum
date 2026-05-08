import { describe, expect, test } from "bun:test";

import type { Renderer } from "../renderer.ts";
import { TaskDetailScreen } from "../screens/task-detail.ts";

class BufferRenderer {
  lines: string[] = [];
  writeln(line = ""): void {
    this.lines.push(line);
  }
  separator(): void {
    this.lines.push("----");
  }
  text(): string {
    return this.lines.join("\n");
  }
}

describe("Phase 09.6 TUI task relationship hub", () => {
  test("renders work item modes, relationship links, and trace drawer data", async () => {
    const screen = new TaskDetailScreen({
      taskId: "task_1",
      caller: {
        tasks: {
          get: async () => ({
            id: "task_1",
            title: "Ship work hub",
            status: "in_progress",
            taskType: "story",
            breadcrumb: [{ id: "epic_1", title: "Workflow", status: "open" }],
            subtasks: [{ id: "sub_1", title: "Wire CLI", status: "todo" }],
            links: {
              docs: [{ id: "doc_1", title: "Spec" }],
              runs: [{ id: "run_1", title: "Agent run" }],
              artifacts: [{ id: "artifact_1", title: "Diff" }],
              memory: [{ id: "mem_1", title: "Decision" }],
            },
            modes: [
              { id: "planning", title: "Planning" },
              { id: "docs", title: "Docs" },
              { id: "repo-workspace", title: "Repo/Workspace" },
              { id: "agent-run", title: "Agent Run" },
              { id: "knowledge", title: "Knowledge" },
              { id: "audit-activity", title: "Audit/Activity" },
            ],
            trace: {
              projectId: "proj_1",
              entity: { kind: "work_item", id: "task_1" },
              audit: [{ id: "evt_1", verb: "viewed" }],
            },
          }),
        },
      },
    });
    await screen.load();
    const renderer = new BufferRenderer();

    screen.render(renderer as unknown as Renderer);

    const text = renderer.text();
    expect(text).toContain("Planning");
    expect(text).toContain("Agent Run");
    expect(text).toContain("doc_1");
    expect(text).toContain("run_1");
    expect(text).toContain("artifact_1");
    expect(text).toContain("mem_1");
    expect(text).toContain("proj_1");
    expect(text).toContain("evt_1");
  });
});
