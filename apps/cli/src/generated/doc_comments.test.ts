import { afterEach, describe, expect, test } from "bun:test";

import { createDocCommentsCommand } from "./doc_comments.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated document comment commands", () => {
  test("route comment commands through the Nest document API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      if (String(url).includes("/comments/comment-1/resolve")) return Response.json({ id: "comment-1", status: "resolved" });
      if (String(url).includes("/comments/comment-1") && init?.method === "PATCH") {
        return Response.json({ id: "comment-1", bodyMd: body?.bodyMd, status: body?.status });
      }
      if (String(url).includes("/comments/comment-1") && init?.method === "DELETE") return new Response(null, { status: 204 });
      if (init?.method === "POST") return Response.json({ id: "comment-1", bodyMd: body?.bodyMd });
      return Response.json([{ id: "comment-1", status: "open" }]);
    }) as typeof fetch;

    await createDocCommentsCommand().parseAsync([
      "create",
      "--doc-id",
      "doc-1",
      "--author-id",
      "user-1",
      "--body-md",
      "Looks good",
      "--json",
    ], { from: "user" });
    await createDocCommentsCommand().parseAsync(["list", "--doc-id", "doc-1", "--include-resolved", "--json"], { from: "user" });
    await createDocCommentsCommand().parseAsync(["update", "--id", "comment-1", "--body-md", "Updated", "--resolved", "--json"], { from: "user" });
    await createDocCommentsCommand().parseAsync(["resolve", "--id", "comment-1", "--json"], { from: "user" });
    await createDocCommentsCommand().parseAsync(["delete", "--id", "comment-1", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "http://127.0.0.1:3210/api/v1/docs/doc-1/comments"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/comments"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1/resolve"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1"],
    ]);
    expect(calls[0]?.body).toMatchObject({ authorId: "user-1", bodyMd: "Looks good" });
    expect(calls[2]?.body).toMatchObject({ bodyMd: "Updated", status: "resolved" });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { id: "comment-1", bodyMd: "Looks good" },
      [{ id: "comment-1", status: "open" }],
      { id: "comment-1", bodyMd: "Updated", status: "resolved" },
      { id: "comment-1", status: "resolved" },
      { ok: true },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
