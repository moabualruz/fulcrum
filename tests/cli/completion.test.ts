import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { generateCliFiles } from "../../scripts/cli/codegen.ts";
import { generateCompletionScripts } from "@fulcrum/cli/completion.ts";

const root = resolve(import.meta.dir, "../..");

const requiredDomains = [
  "agent_runs",
  "artifacts",
  "audit",
  "auth",
  "backup",
  "connectors",
  "context",
  "credentials",
  "customFieldDefs",
  "db",
  "doc_comments",
  "doc_links",
  "doc_versions",
  "docs",
  "doctor",
  "flags",
  "fulcrum_skills",
  "health",
  "inference",
  "invitations",
  "memories",
  "notify",
  "orgs",
  "projects",
  "repos",
  "routing",
  "sprints",
  "tasks",
  "webhooks",
];

const taskVerbs = [
  "bulk-delete",
  "bulk-update",
  "create",
  "delete",
  "get",
  "list",
  "list-children",
  "set-dependencies",
  "set-parent",
  "update",
];

describe("CLI shell completions", () => {
  test("generates non-empty bash, zsh, and fish scripts covering domains and task verbs", async () => {
    const scripts = await generateCompletionScripts({
      routerPath: join(root, "apps/server/src/trpc/router.ts"),
    });

    for (const shell of ["bash", "zsh", "fish"] as const) {
      const script = scripts[shell];
      expect(script.length).toBeGreaterThan(500);
      expect(script).toContain("fulcrum");
      for (const domain of requiredDomains) {
        expect(script).toContain(domain);
      }
      for (const verb of taskVerbs) {
        expect(script).toContain(verb);
      }
    }
  });

  test("completion codegen writes deterministic static scripts", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-completions-"));
    try {
      await generateCliFiles({
        routerPath: join(root, "apps/server/src/trpc/router.ts"),
        outDir: join(scratch, "generated"),
        completionsDir: join(scratch, "scripts"),
        useAst: true,
      });

      const runtime = await generateCompletionScripts({
        routerPath: join(root, "apps/server/src/trpc/router.ts"),
      });

      expect(await readFile(join(scratch, "scripts", "completions.sh"), "utf8")).toBe(runtime.bash);
      expect(await readFile(join(scratch, "scripts", "completions.zsh"), "utf8")).toBe(runtime.zsh);
      expect(await readFile(join(scratch, "scripts", "completions.fish"), "utf8")).toBe(runtime.fish);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("committed static completion scripts match runtime generation", async () => {
    const runtime = await generateCompletionScripts({
      routerPath: join(root, "apps/server/src/trpc/router.ts"),
    });

    expect(await readFile(join(root, "scripts/cli/completions.sh"), "utf8")).toBe(runtime.bash);
    expect(await readFile(join(root, "scripts/cli/completions.zsh"), "utf8")).toBe(runtime.zsh);
    expect(await readFile(join(root, "scripts/cli/completions.fish"), "utf8")).toBe(runtime.fish);
  });
});
