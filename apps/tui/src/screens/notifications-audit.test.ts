import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { NotificationsScreen } from "./notifications.ts";
import { ActivityFeedScreen } from "./activity.ts";
import { NotificationRulesScreen } from "./notification-rules.ts";
import { AuditLogScreen } from "./audit.ts";

let scratch = "";

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-tui-p12-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function renderer() {
  const tty = new FakeTTY();
  return { tty, renderer: new Renderer(tty) };
}

describe("P12 TUI inbox and audit screens", () => {
  test("inbox renders unread rows, marks read, mutes selected subject, and opens entity", async () => {
    const calls: string[] = [];
    let opened: { kind: string; id: string } | undefined;
    const screen = new NotificationsScreen({
      caller: {
        notify: {
          list: async () => [
            {
              id: "n1",
              sourceKind: "task",
              sourceId: "11111111-1111-4111-8111-111111111111",
              title: "Task changed",
              read: false,
            },
          ],
          markRead: async (input) => {
            calls.push(`read:${input.id}`);
            return { ok: true };
          },
          mute: async (input) => {
            calls.push(`mute:${input.sourceKind}:${input.sourceId}`);
            return { ok: true };
          },
        },
      },
      initialBellCount: 1,
      onOpenEntity: (entity) => {
        opened = entity;
      },
    });

    await screen.load();
    const view = renderer();
    screen.render(view.renderer);
    expect(view.tty.plainText()).toContain("[unread] Task changed");

    await screen.handleKey("R");
    await screen.handleKey("M");
    await screen.handleKey("\r");

    const after = renderer();
    screen.render(after.renderer);
    expect(after.tty.plainText()).toContain("[read] Task changed");
    expect(calls).toEqual([
      "read:n1",
      "mute:task:11111111-1111-4111-8111-111111111111",
    ]);
    expect(opened).toEqual({ kind: "task", id: "11111111-1111-4111-8111-111111111111" });
  });

  test("activity feed renders filter chips and reloads with selected chip filters", async () => {
    const queries: Array<Record<string, unknown>> = [];
    const screen = new ActivityFeedScreen({
      caller: {
        audit: {
          query: async (input) => {
            queries.push({ ...input });
            return {
              items: input.subjectKind === "doc"
                ? [{
                  id: "e2",
                  subjectKind: "doc",
                  verb: "updated",
                  actor: "alex@example.com",
                  subjectId: "d1",
                  createdAt: new Date("2026-05-02T10:00:00Z"),
                }]
                : [{
                  id: "e1",
                  subjectKind: "task",
                  verb: "created",
                  actor: "sam@example.com",
                  subjectId: "t1",
                  createdAt: new Date("2026-05-01T10:00:00Z"),
                }],
              total: 1,
              limit: 50,
              offset: 0,
            };
          },
        },
      },
      filterChips: {
        kind: ["task", "doc"],
        verb: ["created", "updated"],
        actor: ["sam@example.com", "alex@example.com"],
      },
    });

    await screen.load();
    await screen.handleKey("\t");
    await screen.handleKey(" ");

    const view = renderer();
    screen.render(view.renderer);

    expect(queries.at(-1)).toMatchObject({ subjectKind: "doc" });
    expect(view.tty.plainText()).toContain("[doc]");
    expect(view.tty.plainText()).toContain("doc updated alex@example.com d1");
  });

  test("rules editor creates and deletes rules, and saves quiet hours", async () => {
    const calls: string[] = [];
    const screen = new NotificationRulesScreen({
      caller: {
        notify: {
          rules: {
            list: async () => [{ id: "r1", name: "Mention me", enabled: true, channels: ["in-app"] }],
            create: async (input) => {
              calls.push(`create:${input.name}`);
              return { id: "r2", name: input.name, enabled: true, channels: input.channels };
            },
            update: async (input) => {
              calls.push(`update:${input.id}:${String(input.enabled)}`);
              return { id: input.id, name: "Mention me", enabled: input.enabled ?? true, channels: ["in-app"] };
            },
            delete: async (input) => {
              calls.push(`delete:${input.id}`);
              return { ok: true };
            },
          },
          quietHours: {
            get: async () => ({ tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] }),
            set: async (input) => {
              calls.push(`quiet:${input.tz}:${input.startHour}-${input.endHour}`);
              return { id: "qh1", ...input };
            },
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("N");
    await screen.submitRuleName("Build failures");
    await screen.handleKey("D");
    await screen.saveQuietHours({ tz: "Europe/Berlin", startHour: 21, endHour: 6, daysOfWeek: [1, 2, 3, 4, 5] });

    const view = renderer();
    screen.render(view.renderer);

    expect(calls).toEqual([
      "create:Build failures",
      "delete:r1",
      "quiet:Europe/Berlin:21-6",
    ]);
    expect(view.tty.plainText()).toContain("Quiet hours");
    expect(view.tty.plainText()).toContain("Europe/Berlin 21-6");
  });

  test("audit panel filters by date and exports JSON file in cwd", async () => {
    const queries: Array<Record<string, unknown>> = [];
    const exports: Array<Record<string, unknown>> = [];
    const screen = new AuditLogScreen({
      cwd: scratch,
      now: () => new Date("2026-05-03T12:34:56Z"),
      caller: {
        audit: {
          query: async (input) => {
            queries.push({ ...input });
            return {
              items: [{
                id: "e1",
                orgId: "11111111-1111-4111-8111-111111111111",
                userId: null,
                subjectKind: "task",
                verb: "created",
                subjectId: "t1",
                payload: null,
                createdAt: new Date("2026-05-03T09:00:00Z"),
              }],
              total: 1,
              limit: 50,
              offset: 0,
            };
          },
          export: async (input) => {
            exports.push({ ...input });
            return {
              format: "json",
              rows: [{
                id: "e1",
                orgId: "11111111-1111-4111-8111-111111111111",
                userId: null,
                subjectKind: "task",
                verb: "created",
                subjectId: "t1",
                payload: null,
                createdAt: new Date("2026-05-03T09:00:00Z"),
              }],
            };
          },
        },
      },
    });

    await screen.setDateFilter("2026-05-03");
    await screen.handleKey("E");

    expect(queries.at(-1)).toMatchObject({
      dateRange: {
        from: new Date("2026-05-03T00:00:00.000Z"),
        to: new Date("2026-05-03T23:59:59.999Z"),
      },
    });
    expect(exports.at(-1)).toMatchObject({ format: "json" });
    expect(await Bun.file(join(scratch, "audit-2026-05-03T12-34-56-000Z.json")).json()).toEqual([
      expect.objectContaining({ id: "e1", subjectKind: "task", verb: "created" }),
    ]);
  });

  test("audit panel writes JSON content returned by the public API caller", async () => {
    const screen = new AuditLogScreen({
      cwd: scratch,
      now: () => new Date("2026-05-03T12:34:56Z"),
      caller: {
        audit: {
          query: async () => [],
          export: async () => ({
            format: "json",
            content: '[{"id":"public-audit","subjectKind":"task"}]',
          }),
        },
      },
    });

    await screen.handleKey("E");

    expect(await Bun.file(join(scratch, "audit-2026-05-03T12-34-56-000Z.json")).json()).toEqual([
      { id: "public-audit", subjectKind: "task" },
    ]);
  });
});
