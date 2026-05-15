import { afterEach, describe, expect, test } from "bun:test";

import { createRelationshipsCommand } from "./relationships.ts";

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

describe("generated relationship commands", () => {
  test("routes task relationship commands through the Nest relationship API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "workspace-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: unknown[] = [];
    console.log = (line?: unknown) => {
      output.push(JSON.parse(String(line)));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/create")) {
        return Response.json({ id: "relationship-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" });
      }
      if (pathname.endsWith("/delete")) {
        return Response.json({ ok: true, relationshipId: "relationship-1" });
      }
      if (pathname.endsWith("/blockers")) {
        return Response.json([{ id: "relationship-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" }]);
      }
      if (pathname.endsWith("/blocked-items")) {
        return Response.json([{ id: "relationship-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" }]);
      }
      if (pathname.endsWith("/list-blocked-by")) {
        return Response.json([{ id: "relationship-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" }]);
      }
      if (pathname.endsWith("/list-for-task")) {
        return Response.json([{ id: "relationship-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" }]);
      }
      if (pathname.endsWith("/mark-as-duplicate")) {
        return Response.json({ id: "relationship-duplicate", sourceTaskId: "task-c", targetTaskId: "task-d", type: "duplicate_of" });
      }
      return Response.json({
        entity: { kind: "work_item", id: "task-a" },
        counts: { workItems: 1 },
        ids: { workItems: ["task-b"] },
        included: [],
      });
    }) as typeof fetch;

    await createRelationshipsCommand().parseAsync([
      "create",
      "--source-task-id",
      "task-a",
      "--target-task-id",
      "task-b",
      "--type",
      "blocks",
      "--json",
    ], { from: "user" });
    await createRelationshipsCommand().parseAsync(["blockers", "--task-id", "task-b", "--json"], { from: "user" });
    await createRelationshipsCommand().parseAsync(["blocked-items", "--project-id", "project-1", "--json"], { from: "user" });
    await createRelationshipsCommand().parseAsync(["list-blocked-by", "--task-id", "task-a", "--json"], { from: "user" });
    await createRelationshipsCommand().parseAsync(["list-for-task", "--task-id", "task-a", "--json"], { from: "user" });
    await createRelationshipsCommand().parseAsync([
      "mark-as-duplicate",
      "--source-task-id",
      "task-c",
      "--target-task-id",
      "task-d",
      "--auto-close",
      "--transfer-watchers",
      "--json",
    ], { from: "user" });
    await createRelationshipsCommand().parseAsync(["delete", "--relationship-id", "relationship-1", "--json"], { from: "user" });
    await createRelationshipsCommand().parseAsync([
      "summary",
      "--entity-kind",
      "work_item",
      "--entity-id",
      "task-a",
      "--entity-label",
      "Task A",
      "--project-id",
      "project-1",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/create",
        body: { orgId: "workspace-1", sourceTaskId: "task-a", targetTaskId: "task-b", type: "blocks" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/blockers",
        body: { orgId: "workspace-1", taskId: "task-b" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/blocked-items",
        body: { orgId: "workspace-1", projectId: "project-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/list-blocked-by",
        body: { orgId: "workspace-1", taskId: "task-a" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/list-for-task",
        body: { orgId: "workspace-1", taskId: "task-a" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/mark-as-duplicate",
        body: {
          orgId: "workspace-1",
          sourceTaskId: "task-c",
          targetTaskId: "task-d",
          autoClose: true,
          transferWatchers: true,
        },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/delete",
        body: { orgId: "workspace-1", relationshipId: "relationship-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/relationships/summary",
        body: {
          orgId: "workspace-1",
          entity: { kind: "work_item", id: "task-a", label: "Task A" },
          projectId: "project-1",
        },
      },
    ]);
    expect(output).toEqual([
      expect.objectContaining({ id: "relationship-1", type: "blocks" }),
      [expect.objectContaining({ id: "relationship-1", type: "blocks" })],
      [expect.objectContaining({ id: "relationship-1", type: "blocks" })],
      [expect.objectContaining({ id: "relationship-1", type: "blocks" })],
      [expect.objectContaining({ id: "relationship-1", type: "blocks" })],
      expect.objectContaining({ id: "relationship-duplicate", type: "duplicate_of" }),
      { ok: true, relationshipId: "relationship-1" },
      expect.objectContaining({ entity: { kind: "work_item", id: "task-a" } }),
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
