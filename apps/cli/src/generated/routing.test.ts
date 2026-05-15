import { afterEach, describe, expect, test } from "bun:test";

import { createRoutingCommand } from "./routing.ts";

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

describe("generated routing commands", () => {
  test("route rule, draft, decision, and config commands through the Nest routing API", async () => {
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
      if (pathname.endsWith("/rules")) {
        return Response.json([{ id: "rule-1", actionAgent: "codex" }]);
      }
      if (pathname.endsWith("/rules/create")) return Response.json({ id: "rule-created", ...body });
      if (pathname.endsWith("/rules/rule-1")) return Response.json({ id: "rule-1", actionAgent: "codex" });
      if (pathname.endsWith("/rules/rule-1/update")) return Response.json({ id: "rule-1", ...body });
      if (pathname.endsWith("/rules/rule-1/delete")) return Response.json({ ok: true });
      if (pathname.endsWith("/dry-run")) return Response.json({ status: "matched", matchedRuleId: "rule-1" });
      if (pathname.endsWith("/test")) return Response.json({ status: "matched", matchedRuleId: "rule-1" });
      if (pathname.endsWith("/config/llm-gate")) return Response.json({ ok: true, enabled: body?.enabled });
      if (pathname.endsWith("/drafts")) return Response.json([{ draftId: "draft-1", status: "review_needed" }]);
      if (pathname.endsWith("/drafts/draft-1/update")) return Response.json({ ok: true });
      if (pathname.endsWith("/drafts/draft-1/approve")) return Response.json({ ok: true });
      if (pathname.endsWith("/drafts/draft-1/delete")) return Response.json({ ok: true });
      return Response.json({ ok: true });
    }) as typeof fetch;

    await runRoutingCommand(["list", "--project-id", "project-1", "--json"]);
    await runRoutingCommand(["create", "--name", "Bug routing", "--task-kind", "bug", "--action-agent", "codex", "--priority", "10", "--enabled", "--source", "manual", "--project-id", "project-1", "--json"]);
    await runRoutingCommand(["get", "--id", "rule-1", "--json"]);
    await runRoutingCommand(["update", "--id", "rule-1", "--action-agent", "claude", "--priority", "20", "--json"]);
    await runRoutingCommand(["delete", "--id", "rule-1", "--json"]);
    await runRoutingCommand(["dry-run", "--task-json-title", "Fix login", "--task-json-kind", "bug", "--task-json-priority", "high", "--task-json-tags", "auth,ux", "--json"]);
    await runRoutingCommand(["test", "--task-id", "task-1", "--json"]);
    await runRoutingCommand(["config", "update-llm-gate", "--enabled", "--input-mode", "task_facts", "--json"]);
    await runRoutingCommand(["drafts", "list", "--status", "review_needed", "--json"]);
    await runRoutingCommand(["drafts", "update", "--draft-id", "draft-1", "--action-agent", "codex", "--json"]);
    await runRoutingCommand(["drafts", "approve", "--draft-id", "draft-1", "--json"]);
    await runRoutingCommand(["drafts", "delete", "--draft-id", "draft-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/routing/rules?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/rules/create"],
      ["GET", "http://127.0.0.1:3210/api/v1/routing/rules/rule-1?orgId=org-1&userId=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/rules/rule-1/update"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/rules/rule-1/delete"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/dry-run"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/test"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/config/llm-gate"],
      ["GET", "http://127.0.0.1:3210/api/v1/routing/drafts?orgId=org-1&userId=user-1&status=review_needed"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/drafts/draft-1/update"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/drafts/draft-1/approve"],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/drafts/draft-1/delete"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Bug routing",
      conditionsJson: { all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }] },
      actionAgent: "codex",
      priority: 10,
      enabled: true,
      source: "manual",
    });
    expect(calls[5]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      taskJson: { title: "Fix login", kind: "bug", priority: "high", tags: ["auth", "ux"] },
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "rule-1", actionAgent: "codex" }],
      expect.objectContaining({ id: "rule-created", actionAgent: "codex" }),
      { id: "rule-1", actionAgent: "codex" },
      expect.objectContaining({ id: "rule-1", actionAgent: "claude" }),
      { ok: true },
      { status: "matched", matchedRuleId: "rule-1" },
      { status: "matched", matchedRuleId: "rule-1" },
      { ok: true, enabled: true },
      [{ draftId: "draft-1", status: "review_needed" }],
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});

async function runRoutingCommand(args: string[]): Promise<void> {
  await createRoutingCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
