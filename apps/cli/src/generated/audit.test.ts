import { afterEach, describe, expect, test } from "bun:test";

import { createAuditCommand } from "./audit.ts";

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

describe("generated audit commands", () => {
  test("route audit commands through the Nest audit API", async () => {
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
      if (String(url).includes("/retention-policies")) return Response.json([{ id: "policy-1", retainDays: 30 }]);
      if (String(url).includes("/retention-policy") && init?.method === "PATCH") {
        return Response.json({ id: "policy-1", retainDays: body?.retainDays });
      }
      if (String(url).includes("/retention-policy")) return Response.json({ id: "policy-1", retainDays: 30 });
      if (String(url).includes("/export")) return Response.json([{ id: "audit-1", verb: "task.created" }]);
      return Response.json({ data: [{ id: "audit-1", verb: "task.created" }], total: 1 });
    }) as typeof fetch;

    await runGeneratedAuditCommand([
      "query",
      "--project-id",
      "project-1",
      "--user-id",
      "user-1",
      "--kind",
      "task",
      "--verb",
      "task.created",
      "--since",
      "2026-05-01T00:00:00.000Z",
      "--until",
      "2026-05-31T00:00:00.000Z",
      "--limit",
      "10",
      "--offset",
      "2",
      "--json",
    ]);
    await runGeneratedAuditCommand(["export", "--format", "json", "--project-id", "project-1", "--json"]);
    await runGeneratedAuditCommand(["retention-policy", "get", "--project-id", "project-1", "--json"]);
    await runGeneratedAuditCommand(["retention-policy", "list", "--project-id", "project-1", "--json"]);
    await runGeneratedAuditCommand([
      "retention-policy",
      "set",
      "--project-id",
      "project-1",
      "--retain-days",
      "45",
      "--json",
    ]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      [
        "GET",
        "http://127.0.0.1:3210/api/v1/audit?orgId=org-1&projectId=project-1&userId=user-1&kind=task&verb=task.created&since=2026-05-01T00%3A00%3A00.000Z&until=2026-05-31T00%3A00%3A00.000Z&limit=10&offset=2",
      ],
      ["GET", "http://127.0.0.1:3210/api/v1/audit/export?orgId=org-1&projectId=project-1&format=json"],
      ["GET", "http://127.0.0.1:3210/api/v1/audit/retention-policy?orgId=org-1&projectId=project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/audit/retention-policies?orgId=org-1&projectId=project-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/audit/retention-policy?orgId=org-1&projectId=project-1"],
    ]);
    expect(calls[4]?.body).toEqual({ retainDays: 45 });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "audit-1", verb: "task.created" }],
      { format: "json", content: "[{\"id\":\"audit-1\",\"verb\":\"task.created\"}]" },
      { id: "policy-1", retainDays: 30 },
      [{ id: "policy-1", retainDays: 30 }],
      { id: "policy-1", retainDays: 45 },
    ]);
  });
});

async function runGeneratedAuditCommand(args: string[]): Promise<void> {
  const command = createAuditCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
