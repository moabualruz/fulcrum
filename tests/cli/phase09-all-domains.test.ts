import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { GENERATED_DOMAIN_COMMANDS } from "@fulcrum/cli/generated-domains.ts";

const BASE_DOMAINS = [
  "projects",
  "tasks",
  "docs",
  "memory",
  "runs",
  "repos",
  "artifacts",
  "search",
  "notifications",
  "skills",
  "router",
  "symphony",
  "inference",
  "components",
  "doctor",
] as const;

const PHASE09_DOMAINS = [
  "i18n",
  "theme",
  "telemetry",
  "backup",
  "data",
  "audit",
  "secrets",
] as const;

const DOMAIN_ALIASES: Record<string, string[]> = {
  components: ["component"],
  data: ["dataExport", "dataImport"],
  memory: ["memories"],
  notifications: ["notify"],
  router: ["routing"],
  secrets: ["credentials"],
  skills: ["fulcrum_skills"],
};

const COVERAGE: Record<string, RegExp[]> = {
  artifacts: [/artifacts\.test\.ts$/],
  audit: [/runs-notify-audit-webhooks\.test\.ts$/, /cross-cutting-platform\.test\.ts$/],
  backup: [/cross-cutting-platform\.test\.ts$/, /backup\.test\.ts$/],
  components: [/component-source\.test\.ts$/],
  data: [/cross-cutting-platform\.test\.ts$/],
  docs: [/docs\.test\.ts$/],
  doctor: [/doctor-source\.test\.ts$/],
  i18n: [/cross-cutting-platform\.test\.ts$/],
  inference: [/inference\.test\.ts$/],
  memory: [/memory\.test\.ts$/],
  notifications: [/runs-notify-audit-webhooks\.test\.ts$/, /notify\.test\.ts$/],
  projects: [/codegen\.test\.ts$/, /codegen-gate\.test\.ts$/],
  repos: [/repos\.test\.ts$/],
  router: [/routing\.test\.ts$/],
  runs: [/runs-notify-audit-webhooks\.test\.ts$/],
  search: [/search\.test\.ts$/],
  secrets: [/cross-cutting-platform\.test\.ts$/],
  skills: [/skills\.test\.ts$/],
  symphony: [/symphony\.test\.ts$/],
  tasks: [/codegen\.test\.ts$/, /completion\.test\.ts$/],
  telemetry: [/cross-cutting-platform\.test\.ts$/],
  theme: [/cross-cutting-platform\.test\.ts$/],
};

async function read(path: string): Promise<string> {
  return Bun.file(new URL(path, import.meta.url)).text();
}

function cliTestFiles(): string[] {
  function walk(relativeDir: string): string[] {
    const root = new URL(`../../${relativeDir}`, import.meta.url);
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) return walk(relativePath);
      return [relativePath];
    });
  }

  return [
    ...walk("tests/cli"),
    ...walk("apps/cli/src"),
  ].filter((file) => file.endsWith(".test.ts"));
}

function generatedAliases(domain: string): string[] {
  return [domain, ...(DOMAIN_ALIASES[domain] ?? [])];
}

describe("Phase 09 all-domain CLI coverage gate", () => {
  test("all required CLI domains are mounted or generated", async () => {
    const index = await read("../../apps/cli/src/index.ts");
    const generated = new Set(GENERATED_DOMAIN_COMMANDS);
    const missing = [...BASE_DOMAINS, ...PHASE09_DOMAINS].filter((domain) =>
      !generatedAliases(domain).some((alias) =>
        generated.has(alias as (typeof GENERATED_DOMAIN_COMMANDS)[number]) ||
        index.includes(`case "${alias}"`) ||
        index.includes(`fulcrum ${alias} `)
      )
    );

    expect(missing).toEqual([]);
  });

  test("each required CLI domain has JSON smoke coverage", async () => {
    const files = cliTestFiles();
    const bodies = await Promise.all(files.map(async (file) => ({
      file,
      body: await Bun.file(new URL(`../../${file}`, import.meta.url)).text(),
    })));
    const missing = [...BASE_DOMAINS, ...PHASE09_DOMAINS].filter((domain) => {
      const matchers = COVERAGE[domain] ?? [new RegExp(`${domain}.*\\.test\\.ts$`)];
      return !bodies.some(({ file, body }) =>
        matchers.some((matcher) => matcher.test(file)) &&
        body.includes("--json")
      );
    });

    expect(missing).toEqual([]);
  });

  test("Phase 09 domains are exposed in top-level CLI help", async () => {
    const index = await read("../../apps/cli/src/index.ts");
    const missing = PHASE09_DOMAINS.filter((domain) => !index.includes(`fulcrum ${domain} `));

    expect(missing).toEqual([]);
  });
});
