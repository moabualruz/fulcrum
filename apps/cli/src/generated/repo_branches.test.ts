import { afterEach, describe, expect, test } from "bun:test";

import { createRepoBranchesCommand } from "./repo_branches.ts";

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

describe("generated repository branch commands", () => {
  test("route branch list and get through the Nest repository API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes("/branch-1")) {
        return Response.json({ id: "branch-1", repoId: "repo-1", name: "main" });
      }
      return Response.json([{ id: "branch-1", repoId: "repo-1", name: "main" }]);
    }) as typeof fetch;

    await createRepoBranchesCommand().parseAsync([
      "list",
      "--repo-id",
      "repo-1",
      "--limit",
      "20",
      "--json",
    ], { from: "user" });
    await createRepoBranchesCommand().parseAsync(["get", "--id", "branch-1", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/repo-branches?orgId=org-1&repoId=repo-1&limit=20"],
      ["GET", "http://127.0.0.1:3210/api/v1/repo-branches/branch-1?orgId=org-1"],
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "branch-1", repoId: "repo-1", name: "main" }],
      { id: "branch-1", repoId: "repo-1", name: "main" },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
