import { afterEach, describe, expect, test } from "bun:test";

import { createTemplatesCommand } from "./templates.ts";

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

describe("generated templates commands", () => {
  test("route template CRUD, apply, and default selection through the Nest template API", async () => {
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
      if (pathname.endsWith("/templates") && init?.method === "GET") {
        return Response.json([{ id: "template-1", name: "Bug template" }]);
      }
      if (pathname.endsWith("/templates") && init?.method === "POST") {
        return Response.json({ id: "template-created", ...body });
      }
      if (pathname.endsWith("/templates/template-1/apply")) {
        return Response.json({ title: "Bug", priority: "high" });
      }
      if (pathname.endsWith("/templates/template-1/default")) return Response.json({ ok: true });
      if (pathname.endsWith("/templates/template-1")) return Response.json({ ok: true });
      return Response.json({ ok: true });
    }) as typeof fetch;

    await runTemplatesCommand(["list", "--project-id", "project-1", "--json"]);
    await runTemplatesCommand([
      "create",
      "--project-id",
      "project-1",
      "--name",
      "Bug template",
      "--description",
      "Reusable bug shape",
      "--template-data-json",
      "{\"title\":\"Bug\",\"priority\":\"high\"}",
      "--json",
    ]);
    await runTemplatesCommand([
      "apply-template",
      "--template-id",
      "template-1",
      "--override-json",
      "{\"priority\":\"urgent\"}",
      "--json",
    ]);
    await runTemplatesCommand(["set-default", "--project-id", "project-1", "--template-id", "template-1", "--json"]);
    await runTemplatesCommand(["delete", "--template-id", "template-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/templates?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/templates"],
      ["POST", "http://127.0.0.1:3210/api/v1/templates/template-1/apply"],
      ["POST", "http://127.0.0.1:3210/api/v1/templates/template-1/default"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/templates/template-1?orgId=org-1&userId=user-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Bug template",
      description: "Reusable bug shape",
      templateData: { title: "Bug", priority: "high" },
    });
    expect(calls[2]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      overrides: { priority: "urgent" },
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "template-1", name: "Bug template" }],
      expect.objectContaining({ id: "template-created", name: "Bug template" }),
      { title: "Bug", priority: "high" },
      { ok: true },
      { ok: true },
    ]);
  });
});

async function runTemplatesCommand(args: string[]): Promise<void> {
  await createTemplatesCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
