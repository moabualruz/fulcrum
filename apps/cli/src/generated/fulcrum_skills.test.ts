import { afterEach, describe, expect, test } from "bun:test";

import { createFulcrumSkillsCommand } from "./fulcrum_skills.ts";

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

describe("generated skill supply commands", () => {
  test("routes every generated fulcrum_skills command through the Nest skill supply API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
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

    await createFulcrumSkillsCommand().parseAsync(["list", "--json"], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync(["registry", "list", "--org-id", "org-2", "--json"], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync(["conflicts", "list", "--json"], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "install",
      "--path",
      "/tmp/review-helper",
      "--json",
    ], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync(["upgrade", "--json"], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "sync",
      "--fetch-upstream",
      "--json",
    ], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "resolve-conflict",
      "--slug",
      "reviewer",
      "--resolution",
      "editor",
      "--json",
    ], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "conflicts",
      "override",
      "--conflict-id",
      "reviewer",
      "--resolution",
      "local",
      "--audit-note",
      "manual",
      "--json",
    ], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "lock",
      "override",
      "--slug",
      "reviewer",
      "--expected-sha256",
      "expected",
      "--actual-sha256",
      "actual",
      "--audit-note",
      "manual",
      "--json",
    ], { from: "user" });
    await createFulcrumSkillsCommand().parseAsync([
      "uninstall",
      "--slug",
      "reviewer",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/skills?orgId=org-1",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/skills/registry?orgId=org-2",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/skills/conflicts",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/skills",
        body: { path: "/tmp/review-helper" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/skills/upgrade",
        body: { slug: "all" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/skills/sync",
        body: { fetchUpstream: true },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/skills/conflicts/resolve",
        body: { resolution: "editor", slug: "reviewer" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/skills/conflicts/override",
        body: { auditNote: "manual", conflictId: "reviewer", resolution: "local" },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/skills/lock",
        body: {
          actualSha256: "actual",
          auditNote: "manual",
          expectedSha256: "expected",
          slug: "reviewer",
        },
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/skills/reviewer",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [skillRow()],
      [skillRow()],
      [conflictRow()],
      skillRow(),
      [skillRow()],
      { merged: [], conflicts: ["reviewer"], errors: [] },
      skillRow(),
      { ok: true },
      { ok: true },
      { ok: true, slug: "reviewer" },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/skills" && method === "GET") return [skillRow()];
  if (path === "/api/v1/skills/registry") return [skillRow()];
  if (path === "/api/v1/skills/conflicts" && method === "GET") return [conflictRow()];
  if (path === "/api/v1/skills" && method === "POST") return skillRow();
  if (path === "/api/v1/skills/upgrade") return [skillRow()];
  if (path === "/api/v1/skills/sync") return { merged: [], conflicts: ["reviewer"], errors: [] };
  if (path === "/api/v1/skills/conflicts/resolve") return skillRow();
  if (path === "/api/v1/skills/conflicts/override") return { ok: true };
  if (path === "/api/v1/skills/lock") return { ok: true };
  if (path === "/api/v1/skills/reviewer" && method === "DELETE") return { ok: true, slug: "reviewer" };
  throw new Error(`unexpected request ${method} ${path}`);
}

function skillRow() {
  return {
    id: "reviewer",
    name: "reviewer",
    slug: "reviewer",
    source: "local",
    upstreamRepo: null,
    upstreamRef: null,
    version: "1.0.0",
    hash: "hash",
    installedAt: "2026-05-14T00:00:00.000Z",
    enabledAgents: ["codex"],
  };
}

function conflictRow() {
  return {
    id: "reviewer",
    slug: "reviewer",
    kind: "lock",
    status: "open",
    localHash: "hash",
    upstreamHash: "upstream",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
