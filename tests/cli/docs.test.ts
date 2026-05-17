import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import type { DocsRunOptions } from "@fulcrum/cli/commands/docs.ts";

const DOC = {
  id: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  title: "My ADR",
  slug: "my-adr",
  parentId: null,
  projectId: null,
  scope: "global",
  docType: "adr",
  frontmatter: { title: "My ADR" },
  bodyMd: "# My ADR\n\nOriginal body",
  contentJson: {},
  sortPosition: 0,
  archived: false,
  externalId: "my-adr",
  updatedAt: new Date("2026-05-03T00:00:00Z"),
};

function fakeCaller() {
  const calls: unknown[] = [];
  return {
    calls,
    docs: {
      list: async (input: unknown) => {
        calls.push(["list", input]);
        return [DOC];
      },
      get: async (input: unknown) => {
        calls.push(["get", input]);
        return DOC;
      },
      create: async (input: unknown) => {
        calls.push(["create", input]);
        return { ...DOC, bodyMd: "# My ADR" };
      },
      update: async (input: unknown) => {
        calls.push(["update", input]);
        return { ...DOC, ...(input as Record<string, unknown>) };
      },
      delete: async (input: unknown) => {
        calls.push(["delete", input]);
        return (input as { hard?: boolean }).hard ? { deleted: true } : { ...DOC, archived: true };
      },
      search: async (input: unknown) => {
        calls.push(["search", input]);
        return [{ id: DOC.id, title: DOC.title, slug: DOC.slug, docType: DOC.docType }];
      },
    },
  };
}

async function runDocsWithOptions(
  args: readonly string[],
  options: DocsRunOptions = {},
) {
  const { run } = await import("@fulcrum/cli/commands/docs.ts");
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  await run(args, {
    ...options,
    print: (line) => lines.push(line),
    printErr: (line) => errors.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  return { lines, errors, exitCode };
}

async function runDocs(args: readonly string[], caller = fakeCaller()) {
  return {
    caller,
    ...await runDocsWithOptions(args, { caller }),
  };
}

describe("docs CLI commands", () => {
  test("list/get/create/delete/search call docs command boundary and print JSON", async () => {
    const caller = fakeCaller();

    const list = await runDocs(["list", "--type", "adr", "--scope", "global", "--limit", "25", "--json"], caller);
    const get = await runDocs(["get", "my-adr", "--json"], caller);
    const create = await runDocs([
      "create",
      "--title",
      "My ADR",
      "--type",
      "adr",
      "--scope",
      "global",
      "--body",
      "# My ADR",
      "--json",
    ], caller);
    const deleted = await runDocs(["delete", DOC.id, "--hard", "--yes", "--json"], caller);
    const search = await runDocs(["search", "ADR", "--type", "adr", "--json"], caller);

    expect(caller.calls).toEqual([
      ["list", { docType: "adr", scope: "global", limit: 25 }],
      ["get", { slug: "my-adr" }],
      ["create", { title: "My ADR", docType: "adr", scope: "global", bodyMd: "# My ADR" }],
      ["delete", { id: DOC.id, hard: true }],
      ["search", { query: "ADR", docType: "adr" }],
    ]);
    expect(JSON.parse(list.lines[0] as string)[0].slug).toBe("my-adr");
    expect(JSON.parse(get.lines[0] as string).bodyMd).toContain("Original body");
    expect(JSON.parse(create.lines[0] as string)).toMatchObject({ slug: "my-adr", docType: "adr" });
    expect(JSON.parse(deleted.lines[0] as string)).toEqual({ deleted: true });
    expect(JSON.parse(search.lines[0] as string)[0].slug).toBe("my-adr");
    expect([list, get, create, deleted, search].every((result) => result.exitCode === undefined)).toBe(true);
  });

  test("edit opens editor with body_md and sends changed body to docs.update", async () => {
    const caller = fakeCaller();
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-docs-cli-"));
    const editor = join(scratch, "editor.ts");
    await writeFile(editor, "await Bun.write(process.argv[2], '# My ADR\\n\\nEdited body');\n");

    try {
      const result = await runDocs(["edit", "my-adr", "--editor", `bun ${editor}`, "--json"], caller);

      expect(result.exitCode).toBeUndefined();
      expect(caller.calls).toEqual([
        ["get", { slug: "my-adr" }],
        ["update", { id: DOC.id, bodyMd: "# My ADR\n\nEdited body" }],
      ]);
      expect(JSON.parse(result.lines[0] as string).bodyMd).toBe("# My ADR\n\nEdited body");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("create with --type note --project P passes projectId and docType", async () => {
    const caller = fakeCaller();
    const result = await runDocs([
      "create",
      "--title",
      "Design Note",
      "--type",
      "note",
      "--project",
      "00000000-0000-4000-8000-000000000099",
      "--json",
    ], caller);

    expect(result.exitCode).toBeUndefined();
    expect(caller.calls).toEqual([
      ["create", { title: "Design Note", docType: "note", projectId: "00000000-0000-4000-8000-000000000099" }],
    ]);
    expect(JSON.parse(result.lines[0] as string).docType).toBe("adr"); // from fake, but call shape is what matters
  });

  test("list with --project P passes projectId filter", async () => {
    const caller = fakeCaller();
    const result = await runDocs([
      "list",
      "--project",
      "00000000-0000-4000-8000-000000000099",
      "--json",
    ], caller);

    expect(result.exitCode).toBeUndefined();
    expect(caller.calls).toEqual([
      ["list", { projectId: "00000000-0000-4000-8000-000000000099" }],
    ]);
  });

  test("doc-versions list calls docs.versionsList and prints JSON", async () => {
    const caller = fakeCaller();
    (caller.docs as Record<string, unknown>).versionsList = async (input: unknown) => {
      caller.calls.push(["versionsList", input]);
      return [
        { id: "v1", docId: DOC.id, version: 1, bodyMd: "v1 body", createdAt: "2026-05-01T00:00:00Z" },
        { id: "v2", docId: DOC.id, version: 2, bodyMd: "v2 body", createdAt: "2026-05-02T00:00:00Z" },
      ];
    };
    const result = await runDocs(["versions", "list", DOC.id, "--json"], caller);

    expect(result.exitCode).toBeUndefined();
    expect(caller.calls).toEqual([["versionsList", { docId: DOC.id }]]);
    expect(JSON.parse(result.lines[0] as string)).toHaveLength(2);
  });

  test("delete hard requires explicit confirmation", async () => {
    const caller = fakeCaller();
    const result = await runDocs(["delete", DOC.id, "--hard", "--json"], caller);

    expect(result.exitCode).toBe(1);
    expect(caller.calls).toEqual([]);
    expect(result.errors.join("\n")).toContain("--yes");
  });

  test("routes through the document public API when no caller is injected", async () => {
    const requests: Array<[string, string, unknown?]> = [];
    const fetchFn = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push([method, url, body]);

      if (url.includes("/api/v1/docs/templates")) {
        return Response.json([{ id: "template-1", title: "Default note" }]);
      }
      if (url.endsWith(`/api/v1/docs/${DOC.id}/versions`)) {
        return Response.json([{ id: "version-1", docId: DOC.id, version: 1 }]);
      }
      if (method === "POST" && url.endsWith("/api/v1/docs")) {
        return Response.json({ ...DOC, ...body, id: "created-doc" });
      }
      if (url.startsWith("http://127.0.0.1:3210/api/v1/docs?")) {
        return Response.json([DOC]);
      }
      return Response.json(DOC);
    }) as typeof fetch;
    const options: DocsRunOptions = {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: fetchFn,
    };

    const list = await runDocsWithOptions(["list", "--type", "adr", "--json"], options);
    const get = await runDocsWithOptions(["get", "my-adr", "--json"], options);
    const create = await runDocsWithOptions(["create", "--title", "New doc", "--body", "# New", "--json"], options);
    const versions = await runDocsWithOptions(["versions", "list", DOC.id, "--json"], options);
    const templates = await runDocsWithOptions(["template", "list", "--json"], options);

    expect([list, get, create, versions, templates].every((result) => result.exitCode === undefined)).toBe(true);
    expect(JSON.parse(list.lines[0] as string)[0].slug).toBe("my-adr");
    expect(JSON.parse(get.lines[0] as string).id).toBe(DOC.id);
    expect(JSON.parse(create.lines[0] as string)).toMatchObject({ id: "created-doc", title: "New doc", bodyMd: "# New" });
    expect(JSON.parse(versions.lines[0] as string)).toEqual([{ id: "version-1", docId: DOC.id, version: 1 }]);
    expect(JSON.parse(templates.lines[0] as string)).toEqual([{ id: "template-1", title: "Default note" }]);
    expect(requests).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/docs?orgId=org-1&type=adr", undefined],
      ["GET", "http://127.0.0.1:3210/api/v1/docs?orgId=org-1", undefined],
      ["POST", "http://127.0.0.1:3210/api/v1/docs", { title: "New doc", bodyMd: "# New" }],
      ["GET", `http://127.0.0.1:3210/api/v1/docs/${DOC.id}/versions`, undefined],
      ["GET", "http://127.0.0.1:3210/api/v1/docs/templates", undefined],
    ]);
  });

  test("fails fast when the document public API is not configured", async () => {
    const result = await runDocsWithOptions(["list", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.lines).toEqual([]);
    expect(result.errors.join("\n")).toContain("Document API caller is not configured");
  });
});
