import { afterEach, describe, expect, test } from "bun:test";

import { createInvitationsCommand } from "./invitations.ts";

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

describe("generated invitation commands", () => {
  test("routes invitation commands through the Nest invitation API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-owner";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const requestUrl = new URL(String(url));
      calls.push({ url: String(url), method: init?.method, body });
      return Response.json(responseFor(requestUrl.pathname, init?.method ?? "GET"));
    }) as typeof fetch;

    await createInvitationsCommand().parseAsync(["list", "--json"], { from: "user" });
    await createInvitationsCommand().parseAsync(["create", "--email", "New@Test.Local", "--role", "member", "--json"], { from: "user" });
    await createInvitationsCommand().parseAsync(["get", "--id", "inv-1", "--json"], { from: "user" });
    await createInvitationsCommand().parseAsync(["revoke", "--id", "inv-1", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/invitations?orgId=org-1&userId=user-owner",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/invitations",
        body: { orgId: "org-1", userId: "user-owner", email: "New@Test.Local", role: "member" },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/invitations/inv-1?orgId=org-1&userId=user-owner",
        body: null,
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/invitations/inv-1/revoke",
        body: { orgId: "org-1", userId: "user-owner" },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [invitationRow("pending")],
      { ...invitationRow("pending"), token: "plaintext-token" },
      invitationRow("pending"),
      { ok: true },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/invitations" && method === "GET") return [invitationRow("pending")];
  if (path === "/api/v1/invitations" && method === "POST") return { ...invitationRow("pending"), token: "plaintext-token" };
  if (path === "/api/v1/invitations/inv-1" && method === "GET") return invitationRow("pending");
  if (path === "/api/v1/invitations/inv-1/revoke" && method === "PATCH") return { ok: true };
  throw new Error(`unexpected request ${method} ${path}`);
}

function invitationRow(status: string) {
  return {
    id: "inv-1",
    orgId: "org-1",
    email: "new@test.local",
    role: "member",
    invitedBy: "user-owner",
    status,
    expiresAt: "2026-05-21T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
