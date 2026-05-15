import { afterEach, describe, expect, test } from "bun:test";

import { createWebhooksCommand } from "./webhooks.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated webhook commands", () => {
  test("route webhook commands through the Nest webhook API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      if (String(url).includes("/deliveries/delivery-1")) return Response.json({ id: "delivery-1", status: "delivered" });
      if (String(url).includes("/webhook-1/deliveries")) return Response.json([{ id: "delivery-1" }]);
      if (String(url).includes("/webhook-1") && init?.method === "PATCH") {
        return Response.json({ id: "webhook-1", name: body?.name, enabled: body?.enabled });
      }
      if (String(url).includes("/webhook-1") && init?.method === "DELETE") return Response.json({ ok: true });
      if (String(url).includes("/webhook-1")) return Response.json({ id: "webhook-1", name: "Primary" });
      if (init?.method === "POST") return Response.json({ id: "webhook-created", name: body?.name, enabled: body?.enabled });
      return Response.json([{ id: "webhook-1", name: "Primary" }]);
    }) as typeof fetch;

    await runGeneratedWebhooksCommand(["list", "--json"]);
    await runGeneratedWebhooksCommand([
      "create",
      "--name",
      "Primary",
      "--url",
      "https://example.com/hook",
      "--secret",
      "secret-1",
      "--enabled",
      "--json",
    ]);
    await runGeneratedWebhooksCommand(["get", "--id", "webhook-1", "--json"]);
    await runGeneratedWebhooksCommand([
      "update",
      "--id",
      "webhook-1",
      "--name",
      "Primary updated",
      "--enabled",
      "--json",
    ]);
    await runGeneratedWebhooksCommand(["deliveries", "list", "--webhook-id", "webhook-1", "--limit", "5", "--json"]);
    await runGeneratedWebhooksCommand(["deliveries", "get", "--id", "delivery-1", "--json"]);
    await runGeneratedWebhooksCommand(["delete", "--id", "webhook-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/webhooks?orgId=org-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks/webhook-1?orgId=org-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/webhooks/webhook-1?orgId=org-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks/webhook-1/deliveries?orgId=org-1&limit=5"],
      ["GET", "http://127.0.0.1:3210/api/v1/webhooks/deliveries/delivery-1?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/webhooks/webhook-1?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      name: "Primary",
      url: "https://example.com/hook",
      secret: "secret-1",
      enabled: true,
    });
    expect(calls[3]?.body).toMatchObject({
      name: "Primary updated",
      enabled: true,
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "webhook-1", name: "Primary" }],
      { id: "webhook-created", name: "Primary", enabled: true },
      { id: "webhook-1", name: "Primary" },
      { id: "webhook-1", name: "Primary updated", enabled: true },
      [{ id: "delivery-1" }],
      { id: "delivery-1", status: "delivered" },
      { ok: true },
    ]);
  });
});

async function runGeneratedWebhooksCommand(args: string[]): Promise<void> {
  const command = createWebhooksCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
