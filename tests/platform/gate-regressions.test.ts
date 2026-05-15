import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { STEPS } from "../../scripts/ci.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";

type ProcedureDef = {
  _def?: {
    type?: "query" | "mutation" | "subscription";
    meta?: { permission?: { resource?: string; action?: string } };
  };
};

type RouterIntrospection = {
  _def: {
    procedures: Record<string, ProcedureDef>;
  };
};

const PUBLIC_NO_PERMISSION_ALLOWLIST = new Set([
  "auth.acceptInvite",
  "agents.listProfiles",
  "agents.getProfile",
  "orchestration.listRuns",
  "orchestration.getRun",
  "orchestration.getOrchestratorStatus",
  "orchestration.listWorkflowDefs",
  "orchestration.renderPromptPreview",
  "orchestration.fetchCandidateIssues",
  "orchestration.fetchIssuesByStates",
  "orchestration.fetchIssueStatesByIds",
  "orchestration.getWorkspacePath",
  "orchestration.getSymphonyDriftReport",
  "inference.health",
  "inference.models.list",
  "inference.backends.list",
  "inference.backends.probe",
  "inference.config.get",
  "db.ping",
  "health.ping",
]);

const FORBIDDEN_RUNTIME_STUB_PATTERNS = [
  "not wired yet",
  "stub store",
  "In-memory stub",
] as const;

const FORBIDDEN_ROOT_ALIAS_SETS = [
  ["memory", "memories"],
  ["notifications", "notify"],
  ["skills", "fulcrum_skills"],
  ["runs", "agent_runs"],
  ["data", "dataExport"],
] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) return [];
    return [path];
  });
}

function procedureEntries(): Array<[string, ProcedureDef]> {
  return Object.entries((appRouter as unknown as RouterIntrospection)._def.procedures);
}

describe("architecture platform gate regressions", () => {
  test("protected tRPC procedures carry permission metadata", () => {
    const missing = procedureEntries()
      .filter(([path]) => !PUBLIC_NO_PERMISSION_ALLOWLIST.has(path))
      .filter(([, procedure]) => {
        const permission = procedure._def?.meta?.permission;
        return !permission?.resource || !permission?.action;
      })
      .map(([path]) => path)
      .sort();

    expect(missing).toEqual([]);
  });

  test("public Zod schema sources do not use z.any()", () => {
    const root = new URL("../..", import.meta.url).pathname;
    const offenders = [
      ...sourceFiles(join(root, "apps/server/src/trpc/schemas")),
      ...sourceFiles(join(root, "apps/server/src/trpc/routers")),
      ...sourceFiles(join(root, "apps/server/src/runtime/trpc/routers")),
    ]
      .filter((file) => readFileSync(file, "utf8").includes("z.any("))
      .map((file) => relative(root, file))
      .sort();

    expect(offenders).toEqual([]);
  });

  test("runtime CLI/API/TUI code does not ship stub leakage strings", () => {
    const root = new URL("../..", import.meta.url).pathname;
    const runtimeRoots = ["apps/cli/src", "apps/server/src/api", "apps/tui/src"].map((dir) => join(root, dir));
    const offenders = runtimeRoots.flatMap((dir) => {
      try {
        return sourceFiles(dir);
      } catch {
        return [];
      }
    }).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN_RUNTIME_STUB_PATTERNS
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${relative(root, file)}:${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  test("root appRouter keeps canonical names instead of duplicate aliases", () => {
    const mounted = new Set(procedureEntries().map(([path]) => path.split(".")[0]));
    const duplicates = FORBIDDEN_ROOT_ALIAS_SETS
      .filter((aliases) => aliases.filter((alias) => mounted.has(alias)).length > 1)
      .map((aliases) => aliases.join(","));

    expect(duplicates).toEqual([]);
  });

  test("CI keeps regression gates for tRPC permissions, schemas, and Symphony", () => {
    const steps = new Map(STEPS.map((step) => [step.name, step.cmd.join(" ")]));

    expect(steps.get("trpc:permissions")).toContain("tests/trpc/app-router-scaffold.test.ts");
    expect(steps.get("ci:schemas")).toContain("scripts/ci-schemas.ts");
    expect(steps.get("symphony:lock")).toContain("tests/execution-orchestration/symphony/spec-lock.test.ts");
    expect(steps.get("symphony:conformance")).toContain("services/execution-orchestration/src/infrastructure/agent-runtime/__tests__/symphony-conformance.test.ts");
  });

  test("compression and skills policy remain explicitly represented in CI tests", () => {
    const ciSource = readFileSync(new URL("../../scripts/ci.ts", import.meta.url), "utf8");
    const ciTestSource = readFileSync(new URL("../../scripts/ci.test.ts", import.meta.url), "utf8");
    const ciText = `${ciSource}\n${ciTestSource}`;

    expect(ciText).toContain("compress");
    expect(ciText).toContain("skills");
  });
});
