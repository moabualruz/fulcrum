import { afterEach, describe, expect, test } from "bun:test";

import { createDocsCommand } from "./docs.ts";

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

describe("generated document commands", () => {
  test("route document CRUD commands through the Nest document API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({
        url: String(url),
        method: init?.method,
        body,
      });
      if (String(url).includes("/comments/comment-1/resolve")) return Response.json({ id: "comment-1", status: "resolved" });
      if (String(url).includes("/comments/comment-1") && init?.method === "PATCH") {
        return Response.json({ id: "comment-1", bodyMd: body?.bodyMd, status: body?.status });
      }
      if (String(url).includes("/comments/comment-1") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (String(url).includes("/doc-1/comments") && init?.method === "POST") {
        return Response.json({ id: "comment-1", docId: "doc-1", bodyMd: body?.bodyMd, status: "open" });
      }
      if (String(url).includes("/doc-1/comments")) return Response.json([{ id: "comment-1", status: "open" }]);
      if (String(url).includes("/doc-1/backlinks")) return Response.json([{ id: "link-1", targetDocId: "doc-1" }]);
      if (String(url).includes("/doc-1/forward-links")) return Response.json([{ id: "link-2", sourceDocId: "doc-1" }]);
      if (String(url).includes("/doc-1/versions/diff")) {
        return Response.json({ docId: "doc-1", from: { version: 1 }, to: { version: 2 } });
      }
      if (String(url).includes("/doc-1/versions/1/restore")) return Response.json({ id: "doc-1", title: "Restored" });
      if (String(url).includes("/doc-1/versions/1")) return Response.json({ id: "version-1", version: 1 });
      if (String(url).includes("/doc-1/versions")) return Response.json([{ id: "version-1", version: 1 }]);
      if (String(url).includes("/api/v1/docs/templates/resolve")) {
        return Response.json({ docType: "note", template: { id: "template-1" } });
      }
      if (String(url).includes("/api/v1/docs/templates")) return Response.json([{ id: "template-1", type: "template" }]);
      if (init?.method === "POST") return Response.json({ id: "doc-created", title: body?.title, type: body?.type });
      if (init?.method === "PATCH") return Response.json({ id: "doc-1", title: body?.title, type: body?.type });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("/doc-1")) return Response.json({ id: "doc-1", title: "One" });
      return Response.json([{ id: "doc-1", title: "One" }]);
    }) as typeof fetch;

    await runGeneratedDocsCommand(["list", "--project-id", "project-1", "--json"]);
    await runGeneratedDocsCommand([
      "create",
      "--project-id",
      "project-1",
      "--title",
      "Planning note",
      "--doc-type",
      "note",
      "--body-md",
      "freeform context",
      "--json",
    ]);
    await runGeneratedDocsCommand(["get", "--id", "doc-1", "--json"]);
    await runGeneratedDocsCommand(["templates", "list", "--project-id", "project-1", "--json"]);
    await runGeneratedDocsCommand([
      "templates",
      "resolve",
      "--project-id",
      "project-1",
      "--doc-type",
      "note",
      "--json",
    ]);
    await runGeneratedDocsCommand([
      "comments",
      "create",
      "--doc-id",
      "doc-1",
      "--author-id",
      "user-1",
      "--body-md",
      "Review note",
      "--selection-json",
      "{\"from\":1}",
      "--json",
    ]);
    await runGeneratedDocsCommand(["comments", "list", "--doc-id", "doc-1", "--json"]);
    await runGeneratedDocsCommand([
      "comments",
      "update",
      "--comment-id",
      "comment-1",
      "--body-md",
      "Updated note",
      "--status",
      "open",
      "--json",
    ]);
    await runGeneratedDocsCommand(["comments", "resolve", "--comment-id", "comment-1", "--json"]);
    await runGeneratedDocsCommand(["links", "list-backlinks", "--doc-id", "doc-1", "--json"]);
    await runGeneratedDocsCommand(["links", "list-forward-links", "--doc-id", "doc-1", "--json"]);
    await runGeneratedDocsCommand(["versions", "list", "--doc-id", "doc-1", "--json"]);
    await runGeneratedDocsCommand(["versions", "get", "--doc-id", "doc-1", "--version", "1", "--json"]);
    await runGeneratedDocsCommand([
      "versions",
      "diff",
      "--doc-id",
      "doc-1",
      "--from-version",
      "1",
      "--to-version",
      "2",
      "--json",
    ]);
    await runGeneratedDocsCommand(["versions", "restore", "--doc-id", "doc-1", "--version", "1", "--json"]);
    await runGeneratedDocsCommand(["comments", "delete", "--comment-id", "comment-1", "--json"]);
    await runGeneratedDocsCommand([
      "update",
      "--id",
      "doc-1",
      "--title",
      "Planning note revised",
      "--doc-type",
      "page",
      "--body-md",
      "revised context",
      "--json",
    ]);
    await runGeneratedDocsCommand(["delete", "--id", "doc-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/docs?orgId=org-1&projectId=project-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/docs"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/templates?projectId=project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/templates/resolve?projectId=project-1&docType=note"],
      ["POST", "http://127.0.0.1:3210/api/v1/docs/doc-1/comments"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/comments"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1/resolve"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/backlinks"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/forward-links"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/versions"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/versions/1"],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/doc-1/versions/diff?fromVersion=1&toVersion=2"],
      ["POST", "http://127.0.0.1:3210/api/v1/docs/doc-1/versions/1/restore"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/docs/comments/comment-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/docs/doc-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/docs/doc-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      projectId: "project-1",
      title: "Planning note",
      type: "note",
      bodyMd: "freeform context",
    });
    expect(calls[5]?.body).toMatchObject({
      authorId: "user-1",
      bodyMd: "Review note",
      selection: { from: 1 },
    });
    expect(calls[7]?.body).toMatchObject({
      bodyMd: "Updated note",
      status: "open",
    });
    expect(calls[8]?.body).toMatchObject({
      resolved: true,
    });
    expect(calls[16]?.body).toMatchObject({
      title: "Planning note revised",
      type: "page",
      bodyMd: "revised context",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "doc-1", title: "One" }],
      { id: "doc-created", title: "Planning note", type: "note" },
      { id: "doc-1", title: "One" },
      [{ id: "template-1", type: "template" }],
      { docType: "note", template: { id: "template-1" } },
      { id: "comment-1", docId: "doc-1", bodyMd: "Review note", status: "open" },
      [{ id: "comment-1", status: "open" }],
      { id: "comment-1", bodyMd: "Updated note", status: "open" },
      { id: "comment-1", status: "resolved" },
      [{ id: "link-1", targetDocId: "doc-1" }],
      [{ id: "link-2", sourceDocId: "doc-1" }],
      [{ id: "version-1", version: 1 }],
      { id: "version-1", version: 1 },
      { docId: "doc-1", from: { version: 1 }, to: { version: 2 } },
      { id: "doc-1", title: "Restored" },
      { ok: true },
      { id: "doc-1", title: "Planning note revised", type: "page" },
      { ok: true },
    ]);
  });
});

async function runGeneratedDocsCommand(args: string[]): Promise<void> {
  const command = createDocsCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
