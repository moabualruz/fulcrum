import { afterEach, describe, expect, test } from "bun:test";

import { createAuthCommand } from "./auth.ts";

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

describe("generated auth commands", () => {
  test("routes auth commands through the Nest auth API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "owner-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json(responseFor(requestUrl.pathname));
    }) as typeof fetch;

    await createAuthCommand().parseAsync(["whoami", "--json"], { from: "user" });
    await createAuthCommand().parseAsync([
      "invite",
      "--email",
      "invitee@example.com",
      "--role",
      "member",
      "--json",
    ], { from: "user" });
    await createAuthCommand().parseAsync(["accept-invite", "--token", "plain-token", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/auth/whoami?orgId=org-1&userId=owner-1",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/auth/invite",
        body: { orgId: "org-1", userId: "owner-1", email: "invitee@example.com", role: "member" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/auth/accept-invite",
        body: { token: "plain-token" },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { userId: "owner-1", orgId: "org-1", email: null, role: "owner", orgName: "Fulcrum" },
      { invitationId: "inv-1", token: "plain-token" },
      { userId: "invitee@example.com", orgId: "org-1" },
    ]);
  });
});

function responseFor(path: string): unknown {
  if (path === "/api/v1/auth/whoami") {
    return { userId: "owner-1", orgId: "org-1", email: null, role: "owner", orgName: "Fulcrum" };
  }
  if (path === "/api/v1/auth/invite") {
    return { invitationId: "inv-1", token: "plain-token" };
  }
  if (path === "/api/v1/auth/accept-invite") {
    return { userId: "invitee@example.com", orgId: "org-1" };
  }
  throw new Error(`unexpected request ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
