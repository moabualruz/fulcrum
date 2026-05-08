import { describe, expect, test } from "bun:test";

describe("Phase 09.6 projects CLI setup parity", () => {
  test("projects create forwards repo path, template, parent, and emits linked ids as JSON", async () => {
    const { run } = await import("../../apps/cli/src/commands/projects.ts");
    const calls: unknown[] = [];
    const lines: string[] = [];
    const caller = {
      projects: {
        list: async () => [],
        get: async () => null,
        create: async (input: unknown) => {
          calls.push(input);
          return {
            links: {
              project: { id: "proj_1" },
              repo: { id: "repo_1", localPath: "/tmp/repo" },
              workflow: { id: "agent-os-software-project" },
            },
            trace: { audit: "evt-1" },
          };
        },
        update: async () => ({}),
        delete: async () => ({}),
        stats: async () => ({}),
      },
    };

    await run([
      "create",
      "--name",
      "Agent OS",
      "--repo-path",
      "/tmp/repo",
      "--template",
      "agent-os-software-project",
      "--parent",
      "proj_parent",
      "--json",
    ], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls[0]).toEqual({
      name: "Agent OS",
      repoPath: "/tmp/repo",
      template: "agent-os-software-project",
      parentId: "proj_parent",
    });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      links: {
        project: { id: "proj_1" },
        repo: { id: "repo_1", localPath: "/tmp/repo" },
        workflow: { id: "agent-os-software-project" },
      },
      trace: { audit: "evt-1" },
    });
  });
});
