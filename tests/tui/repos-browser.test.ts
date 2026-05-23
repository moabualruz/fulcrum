import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { ConnectorsScreen } from "@fulcrum/tui/screens/connectors.ts";
import { RepoDetailScreen, ReposScreen } from "@fulcrum/tui/screens/repos.ts";
import { WebhooksScreen } from "@fulcrum/tui/screens/webhooks.ts";
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

    await screen.handleKey("j");
    await screen.handleKey("k");
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
            syncStatus: "healthy",
            lastSyncedAt: "2026-05-03T09:00:00Z",
            branchCount: 8,
            syncLogs: [
              { id: "sync-1", status: "succeeded", message: "fetched origin/main", createdAt: "2026-05-03T09:00:00Z" },
            ],
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
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("File tree");
    expect(initial).toContain("status healthy");
    expect(initial).toContain("Sync log");
    expect(initial).toContain("fetched origin/main");

    await screen.handleKey("\x1b[C");
    await screen.handleKey("\x1b[D");
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

    await screen.handleKey("f");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("File tree");
  });
});

describe("ConnectorsScreen", () => {
  test("renders empty state and simulates config, sync, toggle, and navigation actions", async () => {
    const empty = new ConnectorsScreen({
      caller: { connectors: { list: async () => [] } },
    });
    await empty.load();
    expect(renderPlain((renderer) => empty.render(renderer))).toContain("No connectors configured.");

    const opened: string[] = [];
    const calls: unknown[] = [];
    const screen = new ConnectorsScreen({
      caller: {
        connectors: {
          list: async () => [
            { kind: "github", enabled: true, lastSyncAt: "2026-05-03T08:00:00Z", status: "succeeded" },
            { kind: "linear", enabled: false, lastSyncAt: null, status: "failed", error: "token expired" },
          ],
          sync: async (input) => {
            calls.push({ sync: input });
            return { kind: input.kind, lastSyncAt: "2026-05-03T09:00:00Z", status: "succeeded", error: null };
          },
          toggle: async (input) => {
            calls.push({ toggle: input });
            return { kind: input.kind, enabled: input.enabled };
          },
        },
      },
      onOpenConnector: (kind) => opened.push(kind),
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing).toContain("github  ON");
    expect(listing).toContain("linear  OFF");
    expect(listing).toContain("token expired");

    await screen.handleKey("j");
    await screen.handleKey("k");
    await screen.handleKey("\r");
    expect(opened).toEqual(["github"]);

    await screen.handleKey("s");
    await screen.handleKey(" ");
    expect(calls).toEqual([
      { sync: { kind: "github" } },
      { toggle: { kind: "github", enabled: false } },
    ]);
    const updated = renderPlain((renderer) => screen.render(renderer));
    expect(updated).toContain("2026-05-03T09:00:00Z");
    expect(updated).toContain("github  OFF");
  });
});

describe("WebhooksScreen", () => {
  test("renders empty state and simulates inspect, delivery test, toggle, and navigation actions", async () => {
    const empty = new WebhooksScreen({
      caller: { webhooks: { list: async () => [] } },
    });
    await empty.load();
    expect(renderPlain((renderer) => empty.render(renderer))).toContain("No webhooks configured.");

    const opened: string[] = [];
    const calls: unknown[] = [];
    const screen = new WebhooksScreen({
      caller: {
        webhooks: {
          list: async () => [
            {
              id: "wh-1",
              url: "https://example.test/webhooks/fulcrum",
              events: ["task.updated", "repo.synced"],
              enabled: true,
              createdAt: "2026-05-03T07:00:00Z",
              lastDeliveryStatus: "failed",
              lastDeliveryAt: "2026-05-03T08:00:00Z",
            },
            {
              id: "wh-2",
              url: "https://example.test/webhooks/audit",
              events: ["audit.created"],
              enabled: false,
              createdAt: "2026-05-03T07:30:00Z",
            },
          ],
          testDelivery: async (input) => {
            calls.push({ testDelivery: input });
            return { id: input.id, lastDeliveryStatus: "succeeded", lastDeliveryAt: "2026-05-03T09:00:00Z" };
          },
          toggle: async (input) => {
            calls.push({ toggle: input });
            return { id: input.id, enabled: input.enabled };
          },
        },
      },
      onOpenWebhook: (id) => opened.push(id),
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing).toContain("wh-1");
    expect(listing).toContain("task.updated,repo.synced");
    expect(listing).toContain("delivery: failed");

    await screen.handleKey("j");
    await screen.handleKey("k");
    await screen.handleKey("\r");
    expect(opened).toEqual(["wh-1"]);

    await screen.handleKey("t");
    await screen.handleKey(" ");
    expect(calls).toEqual([
      { testDelivery: { id: "wh-1" } },
      { toggle: { id: "wh-1", enabled: false } },
    ]);
    const updated = renderPlain((renderer) => screen.render(renderer));
    expect(updated).toContain("delivery: succeeded");
    expect(updated).toContain("2026-05-03T09:00:00Z");
    expect(updated).toContain("wh-1  https://example.test/webhooks/fulcrum  OFF");
  });
});
