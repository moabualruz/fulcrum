import { afterEach, describe, expect, test } from "bun:test";

import { createArtifactsCommand } from "./artifacts.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated artifact commands", () => {
  test("routes artifact read commands through the Nest artifact API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/artifact-1")) {
        return Response.json({
          id: "artifact-1",
          projectId: "project-1",
          traceId: "trace-1",
          kind: "prototype",
          title: "Prototype shell",
        });
      }
      return Response.json([
        {
          id: "artifact-1",
          projectId: "project-1",
          traceId: "trace-1",
          kind: "prototype",
          title: "Prototype shell",
        },
      ]);
    }) as typeof fetch;

    await createArtifactsCommand().parseAsync(["get", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync([
      "list",
      "--project-id",
      "project-1",
      "--trace-id",
      "trace-1",
      "--kind",
      "prototype",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/artifacts?projectId=project-1&traceId=trace-1&kind=prototype",
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        projectId: "project-1",
        traceId: "trace-1",
        kind: "prototype",
      }),
      [
        expect.objectContaining({
          id: "artifact-1",
          projectId: "project-1",
          traceId: "trace-1",
          kind: "prototype",
        }),
      ],
    ]);
  });

  test("routes artifact lifecycle commands through the Nest artifact API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body?: unknown }> = [];
    const output: unknown[] = [];
    console.log = (line?: unknown) => {
      output.push(JSON.parse(String(line)));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const call: { url: string; method: string | undefined; body?: unknown } = {
        url: String(url),
        method: init?.method,
      };
      if (init?.body) call.body = JSON.parse(String(init.body));
      calls.push(call);
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/download")) {
        return Response.json({
          artifact: { id: "artifact-1", lifecycleState: "accepted" },
          bodyPath: "artifacts/evidence.md",
          checksumSha256: "sha-evidence",
        });
      }
      if (pathname.endsWith("/accept")) {
        return Response.json({ id: "artifact-1", lifecycleState: "accepted" });
      }
      if (pathname.endsWith("/reject")) {
        return Response.json({ id: "artifact-1", lifecycleState: "rejected" });
      }
      if (pathname.endsWith("/archive")) {
        return Response.json({ id: "artifact-1", archived: true });
      }
      if (pathname.endsWith("/unarchive")) {
        return Response.json({ id: "artifact-1", archived: false });
      }
      if (init?.method === "DELETE") {
        return Response.json({ ok: true, id: "artifact-1", hard: true });
      }
      return Response.json({
        id: "artifact-uploaded",
        projectId: "project-1",
        traceId: "trace-1",
        filename: "evidence.md",
        lifecycleState: "created",
      });
    }) as typeof fetch;

    await createArtifactsCommand().parseAsync(["accept", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync(["reject", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync(["archive", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync(["unarchive", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync(["download", "--id", "artifact-1", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync(["delete", "--id", "artifact-1", "--hard", "--json"], { from: "user" });
    await createArtifactsCommand().parseAsync([
      "upload",
      "--project-id",
      "project-1",
      "--trace-id",
      "trace-1",
      "--filename",
      "evidence.md",
      "--mime",
      "text/markdown",
      "--size-bytes",
      "42",
      "--kind",
      "uat-evidence",
      "--title",
      "UAT evidence",
      "--run-id",
      "run-1",
      "--task-id",
      "task-1",
      "--doc-id",
      "doc-1",
      "--body-path",
      "artifacts/evidence.md",
      "--checksum-sha256",
      "sha-evidence",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      { method: "POST", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/accept" },
      { method: "POST", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/reject" },
      { method: "POST", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/archive" },
      { method: "POST", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/unarchive" },
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/download" },
      { method: "DELETE", url: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1?hard=true" },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/artifacts",
        body: {
          bodyPath: "artifacts/evidence.md",
          checksumSha256: "sha-evidence",
          docId: "doc-1",
          filename: "evidence.md",
          kind: "uat-evidence",
          mime: "text/markdown",
          projectId: "project-1",
          runId: "run-1",
          sizeBytes: "42",
          taskId: "task-1",
          title: "UAT evidence",
          traceId: "trace-1",
        },
      },
    ]);
    expect(output).toEqual([
      expect.objectContaining({ lifecycleState: "accepted" }),
      expect.objectContaining({ lifecycleState: "rejected" }),
      expect.objectContaining({ archived: true }),
      expect.objectContaining({ archived: false }),
      expect.objectContaining({ bodyPath: "artifacts/evidence.md" }),
      expect.objectContaining({ ok: true, hard: true }),
      expect.objectContaining({ id: "artifact-uploaded", traceId: "trace-1" }),
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
