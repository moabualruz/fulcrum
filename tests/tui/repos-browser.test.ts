import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { RepoDetailScreen, ReposScreen } from "@fulcrum/tui/screens/repos.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("ReposScreen", () => {
  test("renders repos, syncs selected repo, registers repo overlay, and opens detail", async () => {
    const synced: string[] = [];
    const registered: unknown[] = [];
    const opened: string[] = [];
    const screen = new ReposScreen({
      caller: {
        repos: {
          list: async () => [
            {
              id: "repo-1",
              name: "Fulcrum",
              slug: "fulcrum",
              supervisionMode: "supervised",
              lastSyncedAt: "2026-05-03T08:00:00Z",
              branchCount: 7,
            },
            {
              id: "repo-2",
              name: "Docs",
              slug: "docs",
              supervisionMode: "manual",
              lastSyncedAt: null,
              branchCount: 1,
            },
          ],
          sync: async (input) => {
            synced.push(input.id);
            return { id: input.id, lastSyncedAt: "2026-05-03T09:00:00Z", branchCount: 8 };
          },
          register: async (input) => {
            registered.push(input);
            return {
              id: "repo-3",
              name: input.name,
              slug: "new-repo",
              supervisionMode: "manual",
              lastSyncedAt: null,
              branchCount: 0,
            };
          },
        },
      },
      onOpenRepo: (id) => opened.push(id),
      viewportRows: 10,
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing).toContain("Repos");
    expect(listing).toContain("Fulcrum");
    expect(listing).toContain("supervised");
    expect(listing).toContain("2026-05-03T08:00:00Z");
    expect(listing).toContain("branches 7");

    await screen.handleKey("s");
    expect(synced).toEqual(["repo-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("branches 8");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("2026-05-03T09:00:00Z");

    await screen.handleKey("r");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Register repo");
    await screen.submitRegister({ name: "New Repo", path: "/workspace/new-repo" });
    expect(registered).toEqual([{ name: "New Repo", path: "/workspace/new-repo" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("New Repo");

    await screen.handleKey("\r");
    expect(opened).toEqual(["repo-3"]);
  });
});

describe("RepoDetailScreen", () => {
  test("expands file tree, renders file content, switches to commit log, and opens unified diff", async () => {
    const screen = new RepoDetailScreen({
      repoId: "repo-1",
      caller: {
        repos: {
          get: async () => ({
            id: "repo-1",
            name: "Fulcrum",
            slug: "fulcrum",
            supervisionMode: "supervised",
            lastSyncedAt: "2026-05-03T09:00:00Z",
            branchCount: 8,
          }),
          fileTree: async () => [
            { id: "src", path: "src", type: "dir", parentId: null },
            { id: "readme", path: "README.md", type: "file", parentId: null },
            { id: "index", path: "apps/cli/src/main.ts", type: "file", parentId: "src" },
          ],
          fileContent: async (input) => ({ path: input.path, content: "export const ok = true;\n" }),
          commits: async () => [
            { sha: "abc1234", message: "feat: repos", author: "Mia", date: "2026-05-03" },
          ],
          diff: async (input) => ({ sha: input.sha, diff: "+added line\n-removed line\n" }),
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("File tree");

    await screen.handleKey("\x1b[C");
    await screen.handleKey("j");
    await screen.handleKey("\r");
    const content = renderPlain((renderer) => screen.render(renderer));
    expect(content).toContain("apps/cli/src/main.ts");
    expect(content).toContain("export const ok = true;");

    await screen.handleKey("l");
    const log = renderPlain((renderer) => screen.render(renderer));
    expect(log).toContain("Commit log");
    expect(log).toContain("abc1234");
    expect(log).toContain("feat: repos");
    expect(log).toContain("Mia");

    await screen.handleKey("\r");
    const diff = renderPlain((renderer) => screen.render(renderer));
    expect(diff).toContain("Unified diff");
    expect(diff).toContain("+added line");
    expect(diff).toContain("-removed line");
  });
});
