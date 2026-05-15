import { afterEach, describe, expect, test } from "bun:test";

import { createThemeCommand } from "./theme.ts";

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

describe("generated theme commands", () => {
  test("routes theme commands through the Nest theme settings API", async () => {
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
      const requestUrl = new URL(String(url));
      calls.push({ url: String(url), method: init?.method, body });
      if (requestUrl.pathname.endsWith("/tokens/theme.accent")) {
        return Response.json({ key: "theme.accent", value: "#2563EB", defaultValue: "#6D28D9" });
      }
      if (requestUrl.pathname.endsWith("/tokens")) {
        return Response.json([{ key: "theme.accent", value: "#6D28D9", defaultValue: "#6D28D9" }]);
      }
      if (init?.method === "PATCH") return Response.json({ accentHue: body?.accentHue, preset: body?.preset });
      return Response.json({ accentHue: 262, preset: "default" });
    }) as typeof fetch;

    await createThemeCommand().parseAsync(["get", "--json"], { from: "user" });
    await createThemeCommand().parseAsync(["update", "--accent-hue", "210", "--preset", "ocean", "--json"], { from: "user" });
    await createThemeCommand().parseAsync(["list-themes", "--json"], { from: "user" });
    await createThemeCommand().parseAsync(["get-theme", "--key", "accent", "--json"], { from: "user" });
    await createThemeCommand().parseAsync([
      "set-theme",
      "--key",
      "accent",
      "--value",
      "#2563EB",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/settings/theme?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/settings/theme",
        body: { orgId: "org-1", userId: "user-1", accentHue: 210, preset: "ocean" },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/settings/theme/tokens?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/settings/theme/tokens/theme.accent?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "PUT",
        url: "http://127.0.0.1:3210/api/v1/settings/theme/tokens/theme.accent",
        body: { orgId: "org-1", userId: "user-1", value: "#2563EB" },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { accentHue: 262, preset: "default" },
      { accentHue: 210, preset: "ocean" },
      [{ key: "theme.accent", value: "#6D28D9", defaultValue: "#6D28D9" }],
      { key: "theme.accent", value: "#2563EB", defaultValue: "#6D28D9" },
      { key: "theme.accent", value: "#2563EB", defaultValue: "#6D28D9" },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
