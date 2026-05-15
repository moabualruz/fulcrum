import { afterEach, describe, expect, test } from "bun:test";

import { createCredentialsCommand } from "./credentials.ts";

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

describe("generated credentials commands", () => {
  test("route credential vault commands through the Nest credential API", async () => {
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
      const pathname = new URL(String(url)).pathname;
      calls.push({ url: String(url), method: init?.method, body });
      if (pathname.endsWith("/credentials") && init?.method === "GET") {
        return Response.json([{ id: "credential-1", name: "LINEAR_API_KEY", archived: false }]);
      }
      if (pathname.endsWith("/credentials/LINEAR_API_KEY") && init?.method === "GET") {
        return Response.json({ name: "LINEAR_API_KEY", value: "secret-value" });
      }
      if (pathname.endsWith("/credentials") && init?.method === "POST") return Response.json({ id: "credential-1", name: body?.name });
      return Response.json({ ok: true });
    }) as typeof fetch;

    await createCredentialsCommand().parseAsync(["list", "--include-archived", "--json"], { from: "user" });
    await createCredentialsCommand().parseAsync(["set", "--name", "LINEAR_API_KEY", "--value", "secret-value", "--json"], { from: "user" });
    await createCredentialsCommand().parseAsync(["get", "--name", "LINEAR_API_KEY", "--json"], { from: "user" });
    await createCredentialsCommand().parseAsync(["rotate", "--name", "LINEAR_API_KEY", "--new-value", "new-secret", "--json"], { from: "user" });
    await createCredentialsCommand().parseAsync(["archive", "--name", "LINEAR_API_KEY", "--json"], { from: "user" });
    await createCredentialsCommand().parseAsync(["remove", "--name", "LINEAR_API_KEY", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/credentials?orgId=org-1&userId=user-1&includeArchived=true"],
      ["POST", "http://127.0.0.1:3210/api/v1/credentials"],
      ["GET", "http://127.0.0.1:3210/api/v1/credentials/LINEAR_API_KEY?orgId=org-1&userId=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/credentials/LINEAR_API_KEY/rotate"],
      ["POST", "http://127.0.0.1:3210/api/v1/credentials/LINEAR_API_KEY/archive"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/credentials/LINEAR_API_KEY?orgId=org-1&userId=user-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({ orgId: "org-1", userId: "user-1", name: "LINEAR_API_KEY", value: "secret-value" });
    expect(calls[3]?.body).toMatchObject({ orgId: "org-1", userId: "user-1", newValue: "new-secret" });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "credential-1", name: "LINEAR_API_KEY", archived: false }],
      { id: "credential-1", name: "LINEAR_API_KEY" },
      { name: "LINEAR_API_KEY", value: "secret-value" },
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
