import { afterEach, describe, expect, test } from "bun:test";

import { createDocVersionsCommand } from "./doc_versions.ts";

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

describe("generated doc_versions commands", () => {
  test("route version-id commands through the Nest document API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes("/version-ids/version-1/diff")) {
        return Response.json({ docId: "doc-1", versionId: "version-1", hasDiff: true });
      }
      if (String(url).includes("/version-ids/version-1/restore")) {
        return Response.json({ id: "doc-1", title: "Restored" });
      }
      if (String(url).includes("/version-ids/version-1")) {
        return Response.json({ id: "version-1", version: 2 });
      }
      return Response.json([{ id: "version-1", version: 2 }]);
    }) as typeof fetch;

    await runGeneratedDocVersionsCommand(["list", "--document-id", "doc-1", "--json"]);
    await runGeneratedDocVersionsCommand(["get", "--document-id", "doc-1", "--version-id", "version-1", "--json"]);
    await runGeneratedDocVersionsCommand(["diff", "--document-id", "doc-1", "--version-id", "version-1", "--json"]);
    await runGeneratedDocVersionsCommand([
      "restore",
      "--document-id",
      "doc-1",
      "--version-id",
      "version-1",
      "--json",
    ]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/versions"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/version-ids/version-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/version-ids/version-1/diff"],
      ["POST", "http://127.0.0.1:3210/api/v1/docs/doc-1/version-ids/version-1/restore"],
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "version-1", version: 2 }],
      { id: "version-1", version: 2 },
      { docId: "doc-1", versionId: "version-1", hasDiff: true },
      { id: "doc-1", title: "Restored" },
    ]);
  });
});

async function runGeneratedDocVersionsCommand(args: string[]): Promise<void> {
  const command = createDocVersionsCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
