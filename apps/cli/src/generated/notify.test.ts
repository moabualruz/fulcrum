import { afterEach, describe, expect, test } from "bun:test";

import { createNotifyCommand } from "./notify.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalUserId = process.env["FULCRUM_USER_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  restoreEnv("FULCRUM_USER_ID", originalUserId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated notification commands", () => {
  test("route notification commands through the Nest notification API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      const text = String(url);
      if (text.includes("/unread-count")) return Response.json({ count: 2 });
      if (text.includes("/mark-all-read")) return Response.json({ count: 2 });
      if (text.includes("/notification-1/mark-read")) return Response.json({ ok: true });
      if (text.includes("/settings")) return Response.json({ channels: [{ name: "email", enabled: true }] });
      if (text.includes("/channels/email/test")) return Response.json({ id: "channel-test-1", channel: "email" });
      if (text.includes("/channels/email")) return Response.json({ channel: "email", enabled: body?.enabled });
      if (text.includes("/rules/rule-1") && init?.method === "PATCH") return Response.json({ id: "rule-1", name: body?.name });
      if (text.includes("/rules/rule-1") && init?.method === "DELETE") return Response.json({ ok: true });
      if (text.includes("/rules/rule-1")) return Response.json({ id: "rule-1", name: "Review" });
      if (text.includes("/rules") && init?.method === "POST") return Response.json({ id: "rule-created", name: body?.name });
      if (text.includes("/rules")) return Response.json([{ id: "rule-1" }]);
      if (text.includes("/quiet-hours") && init?.method === "PATCH") return Response.json({ id: "quiet-1", tz: body?.tz });
      if (text.includes("/quiet-hours")) return Response.json({ id: "quiet-1", tz: "UTC" });
      if (text.includes("/mutes/task/task-1")) return Response.json({ ok: true });
      if (text.includes("/mutes") && init?.method === "POST") return Response.json({ id: "mute-created", subjectKind: body?.subjectKind });
      if (text.includes("/mutes")) return Response.json([{ id: "mute-1" }]);
      return Response.json({ data: [{ id: "notification-1" }] });
    }) as typeof fetch;

    await runGeneratedNotifyCommand(["list", "--unread", "--limit", "5", "--offset", "2", "--json"]);
    await runGeneratedNotifyCommand(["mark-read", "--id", "notification-1", "--json"]);
    await runGeneratedNotifyCommand(["mark-all-read", "--json"]);
    await runGeneratedNotifyCommand(["unread-count", "--json"]);
    await runGeneratedNotifyCommand([
      "channels",
      "config",
      "--channel",
      "email",
      "--email",
      "ops@example.test",
      "--enabled",
      "--json",
    ]);
    await runGeneratedNotifyCommand(["channels", "list", "--json"]);
    await runGeneratedNotifyCommand(["channels", "test", "--channel", "email", "--json"]);
    await runGeneratedNotifyCommand([
      "rules",
      "create",
      "--name",
      "Review",
      "--subject-kind",
      "task",
      "--delivery-mode",
      "digest",
      "--digest-window-seconds",
      "300",
      "--enabled",
      "--json",
    ]);
    await runGeneratedNotifyCommand(["rules", "list", "--json"]);
    await runGeneratedNotifyCommand(["rules", "get", "--id", "rule-1", "--json"]);
    await runGeneratedNotifyCommand([
      "rules",
      "update",
      "--id",
      "rule-1",
      "--name",
      "Review updated",
      "--critical",
      "--json",
    ]);
    await runGeneratedNotifyCommand(["rules", "delete", "--id", "rule-1", "--json"]);
    await runGeneratedNotifyCommand([
      "quiet-hours",
      "set",
      "--tz",
      "UTC",
      "--start-hour",
      "22",
      "--end-hour",
      "7",
      "--days-of-week",
      "1,2,3,4,5",
      "--json",
    ]);
    await runGeneratedNotifyCommand(["quiet-hours", "get", "--json"]);
    await runGeneratedNotifyCommand([
      "mute",
      "--subject-kind",
      "task",
      "--subject-id",
      "task-1",
      "--muted-until",
      "2026-05-15T00:00:00.000Z",
      "--json",
    ]);
    await runGeneratedNotifyCommand(["mutes", "list", "--json"]);
    await runGeneratedNotifyCommand(["unmute", "--subject-kind", "task", "--subject-id", "task-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/notifications?orgId=org-1&userId=user-1&limit=5&offset=2&unread=true"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/notifications/notification-1/mark-read?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/notifications/mark-all-read?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/unread-count?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/notifications/channels/email?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/settings?orgId=org-1&userId=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/notifications/channels/email/test?orgId=org-1&userId=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/notifications/rules?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/rules?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/rules/rule-1?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/notifications/rules/rule-1?orgId=org-1&userId=user-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/notifications/rules/rule-1?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/notifications/quiet-hours?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/quiet-hours?orgId=org-1&userId=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/notifications/mutes?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/notifications/mutes?orgId=org-1&userId=user-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/notifications/mutes/task/task-1?orgId=org-1&userId=user-1"],
    ]);
    expect(calls[4]?.body).toMatchObject({ email: "ops@example.test", enabled: true });
    expect(calls[7]?.body).toMatchObject({
      name: "Review",
      subjectKind: "task",
      deliveryMode: "digest",
      digestWindowSeconds: 300,
      enabled: true,
    });
    expect(calls[12]?.body).toMatchObject({ tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] });
    expect(calls[14]?.body).toMatchObject({
      subjectKind: "task",
      subjectId: "task-1",
      mutedUntil: "2026-05-15T00:00:00.000Z",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "notification-1" }],
      { ok: true, id: "notification-1" },
      { count: 2 },
      { count: 2 },
      { channel: "email", enabled: true },
      [{ name: "email", enabled: true }],
      { id: "channel-test-1", channel: "email" },
      { id: "rule-created", name: "Review" },
      [{ id: "rule-1" }],
      { id: "rule-1", name: "Review" },
      { id: "rule-1", name: "Review updated" },
      { ok: true },
      { id: "quiet-1", tz: "UTC" },
      { id: "quiet-1", tz: "UTC" },
      { id: "mute-created", subjectKind: "task" },
      [{ id: "mute-1" }],
      { ok: true },
    ]);
  });
});

async function runGeneratedNotifyCommand(args: string[]): Promise<void> {
  const command = createNotifyCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
