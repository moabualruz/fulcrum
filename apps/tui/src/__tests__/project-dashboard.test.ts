import { describe, expect, test } from "bun:test";

import type { Renderer } from "../renderer.ts";
import { ProjectDetailScreen } from "../screens/project-detail.ts";
import { ProjectsScreen } from "../screens/projects.ts";

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

describe("TUI project setup parity", () => {
  test("create forwards repo/template/parent setup graph through caller", async () => {
    const calls: unknown[] = [];
    const screen = new ProjectsScreen({
      caller: {
        projects: {
          list: async () => [],
          create: async (input) => {
            calls.push(input);
            return {
              id: "proj_1",
              name: "Agent OS",
              slug: "agent-os",
              repo: { id: "repo_1", localPath: "/tmp/repo", syncStatus: "idle" },
              workflow: { id: "agent-os-software-project" },
            };
          },
          delete: async () => ({ ok: true }),
        },
      },
    });

    await screen.submitCreate({
      name: "Agent OS",
      repoPath: "/tmp/repo",
      template: "agent-os-software-project",
      parentId: "proj_parent",
    });

    expect(calls[0]).toEqual({
      name: "Agent OS",
      repoPath: "/tmp/repo",
      template: "agent-os-software-project",
      parentId: "proj_parent",
    });
  });

  test("detail first viewport shows same project, repo, and workflow ids", () => {
    const screen = new ProjectDetailScreen({
      project: {
        id: "proj_1",
        name: "Agent OS",
        slug: "agent-os",
        repo: { id: "repo_1", localPath: "/tmp/repo", syncStatus: "idle" },
        workflow: { id: "agent-os-software-project" },
      },
    });
    const renderer = new BufferRenderer();

    screen.render(renderer as unknown as Renderer);

    expect(renderer.text()).toContain("proj_1");
    expect(renderer.text()).toContain("repo_1");
    expect(renderer.text()).toContain("/tmp/repo");
    expect(renderer.text()).toContain("agent-os-software-project");
  });
});
