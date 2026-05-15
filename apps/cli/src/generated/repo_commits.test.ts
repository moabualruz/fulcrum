import { afterEach, describe, expect, test } from "bun:test";

import { createRepoCommitsCommand } from "./repo_commits.ts";

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

describe("generated repository commit commands", () => {
  test("route commit list and get through the Nest repository API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes("/commit-1")) {
        return Response.json({ id: "commit-1", repoId: "repo-1", sha: "abc123" });
      }
      return Response.json([{ id: "commit-1", repoId: "repo-1", sha: "abc123" }]);
    }) as typeof fetch;

    await createRepoCommitsCommand().parseAsync([
      "list",
      "--repo-id",
      "repo-1",
      "--branch",
      "main",
      "--limit",
      "20",
      "--json",
    ], { from: "user" });
    await createRepoCommitsCommand().parseAsync(["get", "--id", "commit-1", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/repo-commits?orgId=org-1&repoId=repo-1&branch=main&limit=20"],
      ["GET", "http://127.0.0.1:3210/api/v1/repo-commits/commit-1?orgId=org-1"],
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "commit-1", repoId: "repo-1", sha: "abc123" }],
      { id: "commit-1", repoId: "repo-1", sha: "abc123" },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
