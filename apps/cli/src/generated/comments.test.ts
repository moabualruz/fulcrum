import { afterEach, describe, expect, test } from "bun:test";

import { createCommentsCommand } from "./comments.ts";

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

describe("generated task comment commands", () => {
  test("route comment, reaction, and watcher commands through the Nest comments API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-1";
    const calls: Array<{ url: string; method: string | undefined; body: Record<string, unknown> | null }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      calls.push({ url: String(url), method: init?.method, body });
      if (String(url).endsWith("/create")) return Response.json({ id: "comment-1", body: body?.body });
      if (String(url).endsWith("/list")) return Response.json([{ id: "comment-1", taskId: body?.taskId }]);
      if (String(url).endsWith("/threaded")) return Response.json([{ id: "comment-1", replies: [{ id: "comment-2" }] }]);
      if (String(url).endsWith("/resolve")) return Response.json({ id: body?.commentId, resolved: true });
      if (String(url).endsWith("/unresolve")) return Response.json({ id: body?.commentId, resolved: false });
      if (String(url).endsWith("/add-reaction")) return Response.json({ id: "reaction-1", emoji: body?.emoji });
      if (String(url).endsWith("/remove-reaction")) return Response.json({ ok: true });
      if (String(url).endsWith("/watchers")) return Response.json([{ taskId: body?.taskId, userId: "user-1" }]);
      if (String(url).endsWith("/subscribe")) return Response.json({ ok: true });
      if (String(url).endsWith("/unsubscribe")) return Response.json({ ok: true });
      if (String(url).endsWith("/delete")) return Response.json({ ok: true });
      return Response.json({ ok: true });
    }) as typeof fetch;

    await runCommentsCommand(["create", "--task-id", "task-1", "--body-md", "Looks good", "--json"]);
    await runCommentsCommand(["list", "--task-id", "task-1", "--json"]);
    await runCommentsCommand(["threaded", "--task-id", "task-1", "--json"]);
    await runCommentsCommand(["resolve", "--comment-id", "comment-1", "--json"]);
    await runCommentsCommand(["unresolve", "--comment-id", "comment-1", "--json"]);
    await runCommentsCommand(["add-reaction", "--comment-id", "comment-1", "--emoji", "+1", "--json"]);
    await runCommentsCommand(["remove-reaction", "--comment-id", "comment-1", "--emoji", "+1", "--json"]);
    await runCommentsCommand(["watchers", "--task-id", "task-1", "--json"]);
    await runCommentsCommand(["subscribe", "--task-id", "task-1", "--json"]);
    await runCommentsCommand(["unsubscribe", "--task-id", "task-1", "--json"]);
    await runCommentsCommand(["delete", "--comment-id", "comment-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "http://127.0.0.1:3210/api/v1/comments/create"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/list"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/threaded"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/resolve"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/unresolve"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/add-reaction"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/remove-reaction"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/watchers"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/subscribe"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/unsubscribe"],
      ["POST", "http://127.0.0.1:3210/api/v1/comments/delete"],
    ]);
    expect(calls[0]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      body: { bodyMd: "Looks good" },
    });
    expect(calls[5]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      commentId: "comment-1",
      emoji: "+1",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { id: "comment-1", body: expect.objectContaining({ bodyMd: "Looks good" }) },
      [{ id: "comment-1", taskId: "task-1" }],
      [{ id: "comment-1", replies: [{ id: "comment-2" }] }],
      { id: "comment-1", resolved: true },
      { id: "comment-1", resolved: false },
      { id: "reaction-1", emoji: "+1" },
      { ok: true },
      [{ taskId: "task-1", userId: "user-1" }],
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});

async function runCommentsCommand(args: string[]): Promise<void> {
  await createCommentsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
