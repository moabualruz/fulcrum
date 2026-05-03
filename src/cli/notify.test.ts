import { describe, expect, test } from "bun:test";
import { run, type NotifyClient } from "./notify.ts";

function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  return {
    logs,
    restore: () => {
      console.log = originalLog;
    },
  };
}

function client(overrides: Partial<NotifyClient>): NotifyClient {
  return {
    list: async () => [],
    read: async (id) => ({ id, read_at: "2026-01-01T00:00:00.000Z" }),
    markRead: async (id) => ({ id, read_at: "2026-01-01T00:00:00.000Z" }),
    markAllRead: async () => ({ updated: 0 }),
    mute: async (input) => ({ id: "mute_1", ...input }),
    unmute: async (input) => ({ removed: true, ...input }),
    rulesList: async () => [],
    rulesGet: async (id) => ({ id }),
    rulesCreate: async (input) => ({ id: "rule_1", enabled: true, ...input }),
    rulesUpdate: async (input) => input,
    rulesDelete: async (id) => ({ id, deleted: true }),
    channelsList: async () => [],
    channelsConfig: async (input) => input,
    channelsTest: async (channel) => ({ channel, status: "sent" }),
    ...overrides,
  };
}

describe("fulcrum notify CLI", () => {
  test("list --unread --json passes filters and prints notification array", async () => {
    const calls: unknown[] = [];
    const { logs, restore } = captureConsole();
    try {
      await run(["list", "--unread", "--limit", "10", "--offset", "5", "--json"], {
        client: client({
          list: async (input) => {
            calls.push(input);
            return [{ id: "n1", read_at: null, subject_kind: "task" }];
          },
        }),
      });
    } finally {
      restore();
    }

    expect(calls).toEqual([{ unread: true, limit: 10, offset: 5 }]);
    expect(JSON.parse(logs.join(""))).toEqual([{ id: "n1", read_at: null, subject_kind: "task" }]);
  });

  test("mark-read --all calls markAllRead", async () => {
    let called = false;
    const { logs, restore } = captureConsole();
    try {
      await run(["mark-read", "--all", "--json"], {
        client: client({
          markAllRead: async () => {
            called = true;
            return { updated: 3 };
          },
        }),
      });
    } finally {
      restore();
    }

    expect(called).toBe(true);
    expect(JSON.parse(logs.join(""))).toEqual({ updated: 3 });
  });

  test("mute parses ISO --until", async () => {
    let call: unknown;
    const { logs, restore } = captureConsole();
    try {
      await run(["mute", "task", "task_1", "--until", "2026-12-31T00:00:00Z", "--json"], {
        client: client({
          mute: async (input) => {
            call = input;
            return { id: "mute_1", ...input };
          },
        }),
      });
    } finally {
      restore();
    }

    expect(call).toEqual({ subjectKind: "task", subjectId: "task_1", until: "2026-12-31T00:00:00.000Z" });
    expect(JSON.parse(logs.join(""))).toMatchObject({ subjectKind: "task", subjectId: "task_1" });
  });

  test("rules create parses pattern JSON and channel CSV", async () => {
    let call: unknown;
    const { restore } = captureConsole();
    try {
      await run([
        "rules",
        "create",
        "--name",
        "test",
        "--pattern",
        '{"subject_kind":"task","verb":"created"}',
        "--channels",
        "in-app,email",
        "--disable",
        "--json",
      ], {
        client: client({
          rulesCreate: async (input) => {
            call = input;
            return { id: "rule_1", ...input };
          },
        }),
      });
    } finally {
      restore();
    }

    expect(call).toEqual({
      name: "test",
      pattern: { subject_kind: "task", verb: "created" },
      channels: ["in-app", "email"],
      enabled: false,
    });
  });

  test("channels config masks secret in JSON output", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["channels", "config", "email", "--url", "smtp://mail", "--secret", "topsecret", "--json"], {
        client: client({
          channelsConfig: async (input) => ({ ...input, secret: "topsecret" }),
        }),
      });
    } finally {
      restore();
    }

    expect(logs.join("")).not.toContain("topsecret");
    expect(JSON.parse(logs.join(""))).toEqual({ channel: "email", url: "smtp://mail", secret: "********" });
  });

  test("invalid pattern JSON reports helpful error", async () => {
    await expect(run(["rules", "create", "--name", "bad", "--pattern", "{", "--channels", "in-app"], {
      client: client({}),
    })).rejects.toThrow("invalid --pattern JSON");
  });
});
