import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

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

async function runDocs(args: readonly string[], caller = fakeCaller()) {
  const { run } = await import("../../src/cli/commands/docs.ts");
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  await run(args, {
    caller,
    print: (line) => lines.push(line),
    printErr: (line) => errors.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  return { caller, lines, errors, exitCode };
}

describe("docs CLI commands", () => {
  test("list/get/create/delete/search call docs procedures and print JSON", async () => {
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

  test("delete hard requires explicit confirmation", async () => {
    const caller = fakeCaller();
    const result = await runDocs(["delete", DOC.id, "--hard", "--json"], caller);

    expect(result.exitCode).toBe(1);
    expect(caller.calls).toEqual([]);
    expect(result.errors.join("\n")).toContain("--yes");
  });
});
