import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "../../src/tui/renderer.ts";
import { AuditLogScreen } from "../../src/tui/screens/audit.ts";
import { NotificationsScreen } from "../../src/tui/screens/notifications.ts";
import { SearchScreen } from "../../src/tui/screens/search.ts";
import type { TuiSearchResult } from "../../src/tui/screens/search.ts";
import { SubscriptionBridge } from "../../src/tui/subscriptions.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("SearchScreen", () => {
  test("opens Cmd+K palette, closes with Escape, navigates results, and opens the selected entity", async () => {
    const opened: unknown[] = [];
    const screen = new SearchScreen({
      caller: {
        search: {
          query: async () => [
            { id: "task-1", kind: "tasks", title: "Fix search" },
            { id: "doc-1", kind: "docs", title: "Search docs" },
          ],
        },
      },
      onOpenEntity: (entity) => opened.push(entity),
    });

    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Command palette");

    await screen.handleKey("\x0b");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Command palette");

    await screen.submitPaletteQuery("search");
    await screen.handleKey("\x1b[B");
    await screen.handleKey("\r");
    expect(opened).toEqual([{ kind: "docs", id: "doc-1" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Command palette");

    await screen.handleKey("\x0b");
    await screen.handleKey("\x1b");
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Command palette");
  });

  test("groups query results by kind, cycles facets, and opens the selected entity", async () => {
    const opened: unknown[] = [];
    const searches: unknown[] = [];
    const screen = new SearchScreen({
      caller: {
        search: {
          query: async (input) => {
            searches.push(input);
            return [
              { id: "task-1", kind: "tasks", title: "Fix notification badge", subtitle: "Inbox" },
              { id: "doc-1", kind: "docs", title: "Notification spec", subtitle: "Docs" },
              { id: "memory-1", kind: "memories", title: "Badge decision" },
              { id: "run-1", kind: "runs", title: "TUI agent run" },
              { id: "artifact-1", kind: "artifacts", title: "audit.json" },
            ];
          },
        },
      },
      onOpenEntity: (entity) => opened.push(entity),
    });

    await screen.submitQuery("notification");
    expect(searches).toEqual([{ query: "notification", facets: ["tasks", "docs", "memories", "runs", "artifacts"] }]);

    const rendered = renderPlain((renderer) => screen.render(renderer));
    for (const heading of ["tasks", "docs", "memories", "runs", "artifacts"]) expect(rendered).toContain(heading);
    expect(rendered).toContain("Fix notification badge");

    await screen.handleKey("\t");
    await screen.handleKey(" ");
    await screen.submitQuery("notification");
    expect(searches.at(-1)).toEqual({ query: "notification", facets: ["tasks", "memories", "runs", "artifacts"] });

    await screen.handleKey("\r");
    expect(opened).toEqual([{ kind: "tasks", id: "task-1" }]);
  });

  test("refreshes full-screen result count when facets are toggled", async () => {
    const screen = new SearchScreen({
      caller: {
        search: {
          query: async (input) => {
            const results = [
              { id: "task-1", kind: "tasks", title: "Task search" },
              { id: "doc-1", kind: "docs", title: "Doc search" },
            ] satisfies TuiSearchResult[];
            return results.filter((result) => input.facets.includes(result.kind));
          },
        },
      },
    });

    await screen.handleKey("S");
    await screen.submitQuery("search");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Results (2)");

    await screen.handleKey(" ");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Results (1)");
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Task search");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Doc search");
  });
});

describe("NotificationsScreen", () => {
  test("marks notifications read, mutes source, switches tabs, and updates bell from subscription", async () => {
    const bus = new EventEmitter();
    const marked: unknown[] = [];
    const muted: unknown[] = [];
    const screen = new NotificationsScreen({
      caller: {
        notify: {
          list: async (input) => [
            { id: "n-1", sourceId: "task-1", sourceKind: "task", title: "Mentioned on task", forYou: true, read: false },
            { id: "n-2", sourceId: "doc-1", sourceKind: "doc", title: "Doc changed", forYou: false, read: false },
          ].filter((item) => input.tab === "all" || item.forYou),
          markRead: async (input) => {
            marked.push(input);
            return { ok: true };
          },
          mute: async (input) => {
            muted.push(input);
            return { ok: true };
          },
        },
      },
      subscriptions: new SubscriptionBridge(bus),
      initialBellCount: 1,
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bell: 1");

    await screen.handleKey("R");
    expect(marked).toEqual([{ id: "n-1" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bell: 0");

    bus.emit("notifications.unreadCount", { count: 2 });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bell: 2");

    await screen.handleKey("M");
    expect(muted).toEqual([{ sourceKind: "task", sourceId: "task-1" }]);

    await screen.handleKey("\t");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[All]");

    screen.dispose();
    bus.emit("notifications.unreadCount", { count: 9 });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bell: 2");
  });
});

describe("AuditLogScreen", () => {
  test("filters audit rows and exports JSON to the submitted path", async () => {
    const queries: unknown[] = [];
    const exports: unknown[] = [];
    const screen = new AuditLogScreen({
      caller: {
        audit: {
          query: async (input) => {
            queries.push(input);
            return [
              { id: "audit-1", kind: "task", actor: "mkh", action: "created", at: "2026-05-03T10:00:00Z", target: "task-1" },
            ];
          },
          export: async (input) => {
            exports.push(input);
            return { ok: true };
          },
        },
      },
    });

    await screen.setFilters({ kind: "task", since: "2026-05-01" });
    expect(queries).toEqual([{ kind: "task", since: "2026-05-01" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("task");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("created");

    await screen.handleKey("E");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Export audit log");
    await screen.submitExportPath("/tmp/audit.json");
    expect(exports).toEqual([{ kind: "task", since: "2026-05-01", path: "/tmp/audit.json" }]);
  });
});
