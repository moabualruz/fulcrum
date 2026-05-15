import { afterEach, describe, expect, test } from "bun:test";

import { createReposCommand } from "./repos.ts";

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

describe("generated repository commands", () => {
  test("route repository commands through the Nest repository API", async () => {
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
      if (init?.method === "POST" && String(url).endsWith("/repos")) {
        return Response.json({ id: "repo-created", slug: body?.slug });
      }
      if (init?.method === "POST" && String(url).includes("/repo-1/sync")) {
        return Response.json({ repoId: "repo-1", status: "queued" });
      }
      if (init?.method === "POST" && String(url).endsWith("/sync?orgId=org-1")) {
        return Response.json({ data: [{ repoId: "repo-1", status: "queued" }] });
      }
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("/repo-1/status")) return Response.json({ repoId: "repo-1", status: "synced" });
      if (String(url).includes("/repo-1")) return Response.json({ id: "repo-1", name: "Repo 1" });
      return Response.json([{ id: "repo-1" }]);
    }) as typeof fetch;

    await runGeneratedRepoCommand(["list", "--include-archived", "--json"]);
    await runGeneratedRepoCommand([
      "register",
      "--name",
      "Repo 1",
      "--slug",
      "repo-1",
      "--kind",
      "local",
      "--local-path",
      "/tmp/repo-1",
      "--project-id",
      "project-1",
      "--default-branch",
      "main",
      "--json",
    ]);
    await runGeneratedRepoCommand(["get", "--id", "repo-1", "--json"]);
    await runGeneratedRepoCommand(["status-repo", "--id", "repo-1", "--json"]);
    await runGeneratedRepoCommand(["sync-repo", "--id", "repo-1", "--json"]);
    await runGeneratedRepoCommand(["sync", "--json"]);
    await runGeneratedRepoCommand(["unregister", "--id", "repo-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/repos?orgId=org-1&includeArchived=true"],
      ["POST", "http://127.0.0.1:3210/api/v1/repos"],
      ["GET", "http://127.0.0.1:3210/api/v1/repos/repo-1?orgId=org-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/repos/repo-1/status?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/repos/repo-1/sync?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/repos/sync?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/repos/repo-1?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      name: "Repo 1",
      slug: "repo-1",
      kind: "local",
      localPath: "/tmp/repo-1",
      projectId: "project-1",
      defaultBranch: "main",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "repo-1" }],
      { id: "repo-created", slug: "repo-1" },
      { id: "repo-1", name: "Repo 1" },
      { repoId: "repo-1", status: "synced" },
      { repoId: "repo-1", status: "queued" },
      { data: [{ repoId: "repo-1", status: "queued" }] },
      { ok: true },
    ]);
  });
});

async function runGeneratedRepoCommand(args: string[]): Promise<void> {
  await createReposCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
