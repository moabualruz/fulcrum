import { describe, expect, test } from "bun:test";

import { ReposScreen, type ReposScreenOptions } from "./repos.ts";

class TestRenderer {
  lines: string[] = [];
  writeln(line = ""): void {
    this.lines.push(line);
  }
  separator(): void {
    this.lines.push("---");
  }
}

describe("ReposScreen parity", () => {
  test("renders canonical dashboard row fields and syncs through repos.syncRepo", async () => {
    const calls: unknown[] = [];
    const opts: ReposScreenOptions = {
      caller: {
        repos: {
          list: async () => [{
            id: "repo-1",
            slug: "fulcrum",
            branch: "dev/v1.0",
            dirty: true,
            lastSyncAt: "2026-05-05T20:00:00.000Z",
            openTaskCount: 3,
            health: "stale",
          }],
          syncRepo: async (input) => {
            calls.push(["syncRepo", input]);
            return { repoId: "repo-1", status: "queued", taskName: "repo.sync.local", jobKey: "repo.sync.local:repo-1" };
          },
        },
      },
    };
    const screen = new ReposScreen(opts);
    await screen.load();

    const renderer = new TestRenderer();
    screen.render(renderer as never);
    expect(renderer.lines.join("\n")).toContain("fulcrum");
    expect(renderer.lines.join("\n")).toContain("dev/v1.0");
    expect(renderer.lines.join("\n")).toContain("dirty");
    expect(renderer.lines.join("\n")).toContain("tasks 3");

    await screen.handleKey("s");
    expect(calls).toEqual([["syncRepo", { repoId: "repo-1" }]]);
  });
});
