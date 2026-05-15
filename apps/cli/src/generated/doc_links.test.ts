import { afterEach, describe, expect, test } from "bun:test";

import { createDocLinksCommand } from "./doc_links.ts";

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

describe("generated document link commands", () => {
  test("route link commands through the Nest document API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      if (init?.method === "POST") return Response.json({ id: "link-1", sourceDocId: body?.sourceDocId, targetDocId: body?.targetDocId });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json([{ id: "link-1", targetDocId: "doc-1" }]);
    }) as typeof fetch;

    await createDocLinksCommand().parseAsync([
      "create",
      "--source-doc-id",
      "doc-1",
      "--target-doc-id",
      "doc-2",
      "--link-type",
      "wikilink",
      "--json",
    ], { from: "user" });
    await createDocLinksCommand().parseAsync(["list", "--doc-id", "doc-1", "--direction", "backlinks", "--json"], { from: "user" });
    await createDocLinksCommand().parseAsync(["delete", "--id", "link-1", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "http://127.0.0.1:3210/api/v1/docs/links"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/backlinks"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/docs/links/link-1"],
    ]);
    expect(calls[0]?.body).toMatchObject({
      sourceDocId: "doc-1",
      targetDocId: "doc-2",
      linkType: "wikilink",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { id: "link-1", sourceDocId: "doc-1", targetDocId: "doc-2" },
      [{ id: "link-1", targetDocId: "doc-1" }],
      { ok: true },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
