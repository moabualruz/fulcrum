import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { AuditLogScreen } from "@fulcrum/tui/screens/audit.ts";
import { ActivityFeedScreen } from "@fulcrum/tui/screens/activity.ts";
import { NewDocScreen } from "@fulcrum/tui/screens/new-doc.ts";
import { NotificationsScreen } from "@fulcrum/tui/screens/notifications.ts";
import { NotificationRulesScreen, type TuiNotificationRule, type TuiQuietHours } from "@fulcrum/tui/screens/notification-rules.ts";
import { SearchScreen } from "@fulcrum/tui/screens/search.ts";
import type { TuiSearchResult } from "@fulcrum/tui/screens/search.ts";
import { SubscriptionBridge } from "@fulcrum/tui/subscriptions.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

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
    expect(searches).toEqual([{ query: "notification", facets: ["tasks", "docs", "memories", "runs", "artifacts"], scope: "current" }]);

    const rendered = renderPlain((renderer) => screen.render(renderer));
    for (const heading of ["tasks", "docs", "memories", "runs", "artifacts"]) expect(rendered).toContain(heading);
    expect(rendered).toContain("Fix notification badge");

    await screen.handleKey("\t");
    await screen.handleKey(" ");
    await screen.submitQuery("notification");
    expect(searches.at(-1)).toEqual({ query: "notification", facets: ["tasks", "memories", "runs", "artifacts"], scope: "current" });

    await screen.handleKey("\r");
    expect(opened).toEqual([{ kind: "tasks", id: "task-1" }]);
  });

  test("cycles scope from current project to all projects and global-only", async () => {
    const searches: unknown[] = [];
    const screen = new SearchScreen({
      caller: {
        search: {
          query: async (input) => {
            searches.push(input);
            return [];
          },
        },
      },
    });

    await screen.submitQuery("notification");
    await screen.handleKey("g");
    await screen.handleKey("g");

    expect(searches).toEqual([
      { query: "notification", facets: ["tasks", "docs", "memories", "runs", "artifacts"], scope: "current" },
      { query: "notification", facets: ["tasks", "docs", "memories", "runs", "artifacts"], scope: "all" },
      { query: "notification", facets: ["tasks", "docs", "memories", "runs", "artifacts"], scope: "global" },
    ]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Scope: Global only");
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

describe("NotificationRulesScreen", () => {
  test("loads, renders, creates, edits, toggles, deletes, and saves quiet hours through caller", async () => {
    const calls: unknown[] = [];
    const rules: TuiNotificationRule[] = [
      { id: "r-1", name: "Task assigned", enabled: true, channels: ["in-app"] },
      { id: "r-2", name: "Run failed", enabled: false, channels: ["email"] },
    ];
    let quietHours: TuiQuietHours = { id: "qh-1", tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] };
    const screen = new NotificationRulesScreen({
      caller: {
        notify: {
          rules: {
            list: async () => rules,
            create: async (input) => {
              calls.push({ create: input });
              const created = { id: "r-3", name: input.name, enabled: input.enabled, channels: input.channels };
              rules.push(created);
              return created;
            },
            update: async (input) => {
              calls.push({ update: input });
              const rule = rules.find((candidate) => candidate.id === input.id);
              if (!rule) throw new Error("missing rule");
              Object.assign(rule, input);
              return rule;
            },
            delete: async (input) => {
              calls.push({ delete: input });
              const index = rules.findIndex((candidate) => candidate.id === input.id);
              if (index >= 0) rules.splice(index, 1);
              return { ok: true };
            },
          },
          quietHours: {
            get: async () => quietHours,
            set: async (input) => {
              calls.push({ quietHours: input });
              quietHours = input;
              return input;
            },
          },
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Task assigned");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("UTC 22-7 days:1,2,3,4,5");

    await screen.handleKey("N");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Rule name:");
    await screen.submitRuleName("  Review requested  ");
    expect(calls.at(-1)).toEqual({ create: { name: "Review requested", eventPattern: {}, channels: ["in-app"], enabled: true } });

    await screen.handleKey("j");
    await screen.handleKey(" ");
    expect(calls.at(-1)).toEqual({ update: { id: "r-2", enabled: true } });

    await screen.handleKey("E");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Edit rule name:");
    await screen.submitRuleName("Run recovered");
    expect(calls.at(-1)).toEqual({ update: { id: "r-2", name: "Run recovered" } });

    await screen.saveQuietHours({ tz: "Asia/Amman", startHour: 23, endHour: 6, daysOfWeek: [0, 6] });
    expect(calls.at(-1)).toEqual({ quietHours: { tz: "Asia/Amman", startHour: 23, endHour: 6, daysOfWeek: [0, 6] } });

    await screen.handleKey("D");
    expect(calls.at(-1)).toEqual({ delete: { id: "r-2" } });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Run recovered");
  });
});

describe("ActivityFeedScreen", () => {
  test("loads activity, cycles chip groups, applies filters, and renders empty state", async () => {
    const queries: unknown[] = [];
    const screen = new ActivityFeedScreen({
      caller: {
        audit: {
          query: async (input) => {
            queries.push(input);
            if (input.subjectKind === "task" && input.verb === "updated" && input.userId === "agent") {
              return { items: [], total: 0, limit: 50, offset: 0 };
            }
            return {
              items: [
                { id: "e-1", subjectKind: "task", verb: "created", actor: "human", subjectId: "T-1", createdAt: new Date("2026-05-11T10:00:00Z") },
              ],
              total: 1,
              limit: 50,
              offset: 0,
            };
          },
        },
      },
      filterChips: {
        kind: ["task"],
        verb: ["updated"],
        actor: ["agent"],
      },
    });

    await screen.load();
    expect(queries.at(-1)).toEqual({ limit: 50, offset: 0 });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("task created human T-1");

    await screen.handleKey(" ");
    expect(queries.at(-1)).toEqual({ subjectKind: "task", limit: 50, offset: 0 });
    await screen.handleKey("\t");
    await screen.handleKey(" ");
    expect(queries.at(-1)).toEqual({ subjectKind: "task", verb: "updated", limit: 50, offset: 0 });
    await screen.handleKey("\t");
    await screen.handleKey(" ");
    expect(queries.at(-1)).toEqual({ subjectKind: "task", verb: "updated", userId: "agent", limit: 50, offset: 0 });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("No activity events.");
  });
});

describe("NewDocScreen", () => {
  test("loads templates, navigates type picker, saves selected template body, and handles load errors", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const renderer = new Renderer(tty);
    const saves: unknown[] = [];
    let exited = false;
    const screen = new NewDocScreen(renderer, {
      caller: {
        templates: {
          list: async () => [
            { id: "tpl-1", orgId: "org", projectId: null, docType: "decision", name: "Decision", bodyTemplate: "# Decision\n\nOutcome", frontmatterTemplate: {}, frontmatterSchema: {}, isDefault: true, createdAt: new Date(), updatedAt: new Date() },
            { id: "tpl-2", orgId: "org", projectId: null, docType: "note", name: "Note", bodyTemplate: "# Note", frontmatterTemplate: {}, frontmatterSchema: {}, isDefault: false, createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      },
      onExit: () => { exited = true; },
      onSave: (docType, body) => {
        saves.push({ docType, body });
      },
    });

    await screen.load();
    screen.render();
    expect(tty.plainText()).toContain("New Document");
    expect(screen.currentPhase).toBe("pick-type");

    await screen.handleKey("j");
    await screen.handleKey("\r");
    expect(screen.currentPhase).toBe("edit-body");
    await screen.handleKey("s");
    expect(saves).toEqual([{ docType: screen.currentType, body: screen.currentBodyBuffer }]);

    await screen.handleKey("q");
    expect(screen.currentPhase).toBe("pick-type");
    await screen.handleKey("q");
    expect(exited).toBe(true);

    tty.clear();
    screen.setLoadError(new Error("template service down"));
    screen.render();
    expect(tty.plainText()).toContain("Template load failed");
    expect(tty.plainText()).toContain("template service down");
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
