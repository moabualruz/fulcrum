import { describe, expect, test } from "bun:test";
import { run as runNotify } from "./notify.ts";

function io() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

function caller() {
  const state = {
    notifications: [
      { id: "n1", subjectKind: "task", subjectId: "t1", verb: "created", title: "Task created", read: false },
      { id: "n2", subjectKind: "task", subjectId: "t2", verb: "updated", title: "Task updated", read: true },
    ],
    rules: [] as Array<{ id: string; name: string; channels: string[] }>,
    channels: [] as Array<{ kind: string; config: Record<string, unknown> }>,
  };
  return {
    notify: {
      list: async (input: { unread?: boolean }) => input.unread
        ? state.notifications.filter((row) => !row.read)
        : state.notifications,
      markRead: async ({ id }: { id: string }) => ({ id, read: true }),
      markAllRead: async () => ({ count: state.notifications.filter((row) => !row.read).length }),
      mute: async (input: { subjectKind: string; subjectId: string; mutedUntil?: Date | null }) => input,
      unmute: async (input: { subjectKind: string; subjectId: string }) => ({ ...input, muted: false }),
      rules: {
        list: async () => state.rules,
        get: async ({ id }: { id: string }) => state.rules.find((rule) => rule.id === id) ?? null,
        create: async (input: { name: string; channels: string[] }) => {
          const rule = { id: `r${state.rules.length + 1}`, name: input.name, channels: input.channels };
          state.rules.push(rule);
          return rule;
        },
        update: async (input: Record<string, unknown>) => input,
        delete: async ({ id }: { id: string }) => {
          state.rules = state.rules.filter((rule) => rule.id !== id);
          return { ok: true, id };
        },
      },
      channels: {
        list: async () => state.channels,
        config: async (input: { kind: string; url?: string }) => {
          const channel = { kind: input.kind, config: { url: input.url, secret: "****" } };
          state.channels.push(channel);
          return channel;
        },
        test: async ({ kind }: { kind: string }) => ({ ok: true, kind }),
      },
    },
  };
}

describe("fulcrum notify CLI", () => {
  test("notify list --json returns caller-backed array", async () => {
    const screen = io();
    await runNotify(["list", "--json"], { ...screen.opts, caller: caller() });
    const payload = JSON.parse(screen.out.join("\n"));
    expect(payload).toHaveLength(2);
  });

  test("notify list --unread --json filters to unread only", async () => {
    const screen = io();
    await runNotify(["list", "--unread", "--json"], { ...screen.opts, caller: caller() });
    const payload = JSON.parse(screen.out.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].subjectId).toBe("t1");
  });

  test("notify list requires the configured notification public API when no test caller is injected", async () => {
    const screen = io();
    await runNotify(["list", "--json"], {
      ...screen.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(screen.exits).toEqual([1]);
    expect(screen.err.join("\n")).toContain("Notification API caller is not configured");
  });

  test("notify list uses the configured Nest notification API", async () => {
    const screen = io();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await runNotify(["list", "--unread", "--limit", "5", "--json"], {
      ...screen.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3000/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          data: [{ id: "n-public", subjectKind: "task", subjectId: "task-1", read: false }],
        });
      }) as typeof fetch,
    });

    expect(JSON.parse(screen.out.join("\n"))).toEqual([
      { id: "n-public", subjectKind: "task", subjectId: "task-1", read: false },
    ]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3000/api/v1/notifications?orgId=org-1&userId=user-1&unread=true&limit=5",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });

  test("notify mark-read --all calls caller", async () => {
    const screen = io();
    await runNotify(["mark-read", "--all", "--json"], { ...screen.opts, caller: caller() });
    expect(JSON.parse(screen.out.join("\n"))).toEqual({ count: 1 });
  });

  test("notify mute --until parses ISO date and returns mute row as JSON", async () => {
    const screen = io();
    await runNotify(["mute", "task", "t1", "--until", "2026-12-31T00:00:00Z", "--json"], { ...screen.opts, caller: caller() });
    const payload = JSON.parse(screen.out.join("\n"));
    expect(payload.subjectKind).toBe("task");
    expect(payload.subjectId).toBe("t1");
  });

  test("notify rules create + list round-trip", async () => {
    const c = caller();
    let screen = io();
    await runNotify(["rules", "create", "--name", "test-rule", "--pattern", "{}", "--channels", "in-app,email", "--json"], { ...screen.opts, caller: c });
    expect(JSON.parse(screen.out.join("\n")).name).toBe("test-rule");

    screen = io();
    await runNotify(["rules", "list", "--json"], { ...screen.opts, caller: c });
    expect(JSON.parse(screen.out.join("\n"))).toHaveLength(1);
  });

  test("notify channels config + list with secret masking", async () => {
    const c = caller();
    let screen = io();
    await runNotify(["channels", "config", "email", "--url", "smtp://localhost:25", "--json"], { ...screen.opts, caller: c });
    expect(JSON.parse(screen.out.join("\n")).config.secret).toBe("****");

    screen = io();
    await runNotify(["channels", "list", "--json"], { ...screen.opts, caller: c });
    expect(JSON.parse(screen.out.join("\n"))).toHaveLength(1);
  });

  test("notify channels test returns queued object", async () => {
    const screen = io();
    await runNotify(["channels", "test", "email", "--json"], { ...screen.opts, caller: caller() });
    expect(JSON.parse(screen.out.join("\n"))).toEqual({ ok: true, kind: "email" });
  });

  test("notify help works", async () => {
    const screen = io();
    await runNotify(["--help"], screen.opts);
    expect(screen.out.join("\n")).toContain("fulcrum notify");
  });
});
