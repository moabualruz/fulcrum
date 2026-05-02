import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  generateCliFiles,
  mapZodObjectToFlags,
} from "../../scripts/cli/codegen.ts";

const root = resolve(import.meta.dir, "../..");

async function fileMap(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const rel = join(entry.parentPath.slice(dir.length + 1), entry.name);
    files[rel] = await readFile(join(dir, rel), "utf8");
  }
  return files;
}

describe("CLI codegen", () => {
  test("maps Zod object inputs to deterministic commander flag definitions", () => {
    const flags = mapZodObjectToFlags(z.object({
      name: z.string().describe("Project name"),
      limit: z.number(),
      active: z.boolean(),
      maybe: z.string().optional(),
      mode: z.enum(["fast", "safe"]),
      nested: z.object({
        child: z.string(),
      }),
    }));

    expect(flags).toEqual([
      { name: "active", flag: "--active", type: "boolean", required: true, choices: [], description: null },
      { name: "limit", flag: "--limit <number>", type: "number", required: true, choices: [], description: null },
      { name: "maybe", flag: "--maybe <string>", type: "string", required: false, choices: [], description: null },
      { name: "mode", flag: "--mode <choice>", type: "enum", required: true, choices: ["fast", "safe"], description: null },
      { name: "name", flag: "--name <string>", type: "string", required: true, choices: [], description: "Project name" },
      { name: "nested-child", flag: "--nested-child <string>", type: "string", required: true, choices: [], description: null },
    ]);
  });

  test("emits projects commander command matching the baseline snapshot", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "fulcrum-codegen-snapshot-"));
    try {
      await generateCliFiles({
        routerPath: join(root, "src/server/trpc/router.ts"),
        outDir,
        useAst: true,
      });

      const generated = await readFile(join(outDir, "projects.ts"), "utf8");
      const snapshot = await readFile(join(root, "tests/cli/__snapshots__/codegen.projects.ts"), "utf8");
      expect(generated).toBe(snapshot);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("emits bitwise-identical generated trees across repeated runs", async () => {
    const first = await mkdtemp(join(tmpdir(), "fulcrum-codegen-first-"));
    const second = await mkdtemp(join(tmpdir(), "fulcrum-codegen-second-"));
    try {
      const routerPath = join(root, "src/server/trpc/router.ts");
      await generateCliFiles({ routerPath, outDir: first, useAst: true });
      await generateCliFiles({ routerPath, outDir: second, useAst: true });

      expect(await fileMap(first)).toEqual(await fileMap(second));
    } finally {
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });

  test("committed generated docs command matches fresh codegen output", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-codegen-docs-"));
    try {
      await generateCliFiles({
        routerPath: join(root, "src/server/trpc/router.ts"),
        outDir: scratch,
        useAst: true,
      });

      const generated = await readFile(join(scratch, "docs.ts"), "utf8");
      const committed = await readFile(join(root, "src/cli/generated/docs.ts"), "utf8");
      expect(committed).toBe(generated);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("extracts Zod description strings into generated command descriptions and flag help", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-codegen-fixture-"));
    try {
      const routerPath = join(scratch, "router.ts");
      await writeFile(routerPath, `
        import { z } from "zod";
        import { t } from "./trpc";
        import { protectedProcedure } from "./middleware";

        const CreateInputSchema = z.object({
          name: z.string().describe("Display name"),
        }).describe("Create a project from CLI flags");

        const projectsRouter = t.router({
          create: protectedProcedure
            .input(CreateInputSchema)
            .output(z.object({ ok: z.boolean() }))
            .mutation(() => ({ ok: true })),
        });

        export const appRouter = t.router({ projects: projectsRouter });
        export type AppRouter = typeof appRouter;
      `);

      await generateCliFiles({ routerPath, outDir: scratch, useAst: true });
      const generated = await readFile(join(scratch, "projects.ts"), "utf8");

      expect(generated).toContain('.description("Create a project from CLI flags")');
      expect(generated).toContain('.option("--name <string>", "Display name")');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
