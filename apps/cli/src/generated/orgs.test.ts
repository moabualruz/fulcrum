import { afterEach, describe, expect, test } from "bun:test";

import { createOrgsCommand } from "./orgs.ts";

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

describe("generated org commands", () => {
  test("route organization and member commands through the Nest organization API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-owner";
    const calls: Array<{ url: string; method: string | undefined; body: Record<string, unknown> | null }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      const pathname = new URL(String(url)).pathname;
      calls.push({ url: String(url), method: init?.method, body });
      if (pathname.endsWith("/organizations/current") && init?.method === "GET") {
        return Response.json({ id: "org-1", name: "Fulcrum" });
      }
      if (pathname.endsWith("/organizations/current") && init?.method === "PATCH") return Response.json({ ok: true });
      if (pathname.endsWith("/organizations/members") && init?.method === "GET") {
        return Response.json([{ userId: "user-owner", role: "owner" }]);
      }
      return Response.json({ ok: true });
    }) as typeof fetch;

    await createOrgsCommand().parseAsync(["get", "--json"], { from: "user" });
    await createOrgsCommand().parseAsync(["update", "--name", "Fulcrum Team", "--json"], { from: "user" });
    await createOrgsCommand().parseAsync(["members", "list", "--json"], { from: "user" });
    await createOrgsCommand().parseAsync(["members", "update-role", "--user-id", "user-2", "--role", "admin", "--json"], { from: "user" });
    await createOrgsCommand().parseAsync(["members", "remove", "--user-id", "user-2", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/organizations/current?orgId=org-1&userId=user-owner"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/organizations/current"],
      ["GET", "http://127.0.0.1:3210/api/v1/organizations/members?orgId=org-1&userId=user-owner"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/organizations/members/user-2/role"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/organizations/members/user-2?orgId=org-1&userId=user-owner"],
    ]);
    expect(calls[1]?.body).toMatchObject({ orgId: "org-1", userId: "user-owner", name: "Fulcrum Team" });
    expect(calls[3]?.body).toMatchObject({ orgId: "org-1", userId: "user-owner", role: "admin" });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { id: "org-1", name: "Fulcrum" },
      { ok: true },
      [{ userId: "user-owner", role: "owner" }],
      { ok: true },
      { ok: true },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
