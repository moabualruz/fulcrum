import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { appRouter } from "@fulcrum/server/trpc/router.ts";

const REQUIRED_NAMESPACES = [
  "tasks",
  "sprints",
  "docs",
  "memory",
  "repos",
  "artifacts",
  "search",
  "notifications",
  "audit",
  "backup",
  "telemetry",
  "theme",
  "errorLogs",
  "credentials",
  "routing",
  "skills",
  "inference",
  "timeEntries",
];

const ROOT_ALIASES: Record<string, string> = {
  memory: "memories",
  notifications: "notify",
  skills: "fulcrum_skills",
};

const TEST_FILE_MATCHERS: Record<string, RegExp[]> = {
  artifacts: [/app-router-scaffold\.test\.ts$/],
  auth: [/auth\.test\.ts$/, /router\.test\.ts$/],
  backup: [/backup\.test\.ts$/],
  credentials: [/credentials\.test\.ts$/],
  docs: [/docs-.*\.test\.ts$/],
  errorLogs: [/errorLogs\.test\.ts$/],
  flags: [/flags\.test\.ts$/],
  projects: [/tasks-crud\.test\.ts$/],
  memories: [/memory\.test\.ts$/],
  notify: [/notifications\.test\.ts$/],
  orgs: [/orgs\.test\.ts$/],
  repos: [/repos\.test\.ts$/],
  routing: [/routing\.test\.ts$/],
  sprints: [/sprints-crud\.test\.ts$/],
  tasks: [/tasks-crud\.test\.ts$/],
  telemetry: [/telemetry\.test\.ts$/],
  theme: [/theme\.test\.ts$/],
  webhooks: [/webhooks\.test\.ts$/],
};

const ALLOWLIST: Record<string, string> = {
  agent_runs: "Covered by orchestration/agent-run lifecycle suites outside tests/trpc.",
  agents: "Generated scaffold router; covered by app-router scaffold gate.",
  automations: "task workflow generated task-management router; covered by app-router scaffold until service tests land.",
  comments: "task workflow comment router; covered through task detail/comment service tests.",
  connectors: "Covered by public API connector CSV and generated domain CLI tests.",
  context: "Context assembly behavior covered by context engine tests outside tests/trpc.",
  custom_fields: "Legacy alias covered by customFields tests.",
  customFieldDefs: "Covered by customFields tests.",
  dataExport: "Covered by json-import-export tests.",
  dataImport: "Covered by json-import-export tests.",
  db: "Public ping smoke router; covered by router tests.",
  doc_comments: "Covered by docs-comments tests.",
  doc_links: "Covered by docs-links tests.",
  doc_versions: "Covered by docs CRUD/version tests.",
  doctor: "Doctor is covered by doctor check tests outside tests/trpc.",
  fulcrum_skills: "Skills API is covered by generated scaffold and CLI skills tests.",
  health: "Public ping smoke router; covered by router tests.",
  inference: "Covered by generated scaffold and inference CLI tests.",
  invitations: "Auth invitation flow covered by auth tests.",
  orchestration: "Covered by Symphony conformance and orchestration tests.",
  recurrence: "task workflow recurrence router; covered by task-management service tests.",
  relationships: "task workflow relationship router; covered by task-management service tests.",
  repo_branches: "Repo branch details covered by repos tests.",
  repo_commits: "Repo commit details covered by repos tests.",
  reports: "Covered by reports-burndown tests.",
  runsSubscriptions: "Subscription router covered by subscription/e2e tests.",
  saved_views: "Saved view behavior covered by product-kernel tests.",
  search: "Search router covered by search integration tests outside tests/trpc.",
  taskCustomFields: "Covered by customFields tests.",
  templates: "task workflow templates router; covered by task-management service tests.",
  workflows: "Workflow router covered by orchestration workflow tests.",
  notifySubscriptions: "Subscription router covered by subscription/e2e tests.",
  orchestrationSubscriptions: "Subscription router covered by subscription/e2e tests.",
};

function procedureNamespaces(): string[] {
  return [...new Set(
    Object.keys((appRouter as never as { _def: { procedures: Record<string, unknown> } })._def.procedures)
      .map((path) => path.split(".")[0]!),
  )].sort();
}

function testFiles(): string[] {
  return readdirSync(new URL(".", import.meta.url))
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => basename(file));
}

function hasIntegrationTest(namespace: string, files: string[]): boolean {
  return (TEST_FILE_MATCHERS[namespace] ?? [new RegExp(`${namespace}.*\\.test\\.ts$`)])
    .some((matcher) => files.some((file) => matcher.test(file)));
}

describe("all tRPC router contract gate", () => {
  test("required namespaces are mounted on appRouter", () => {
    const mounted = new Set(procedureNamespaces());
    for (const namespace of REQUIRED_NAMESPACES) {
      expect(mounted.has(ROOT_ALIASES[namespace] ?? namespace), namespace).toBe(true);
    }
  });

  test("every mounted router namespace has integration coverage or explicit reason", () => {
    const files = testFiles();
    const uncovered = procedureNamespaces().filter((namespace) =>
      !hasIntegrationTest(namespace, files) && !ALLOWLIST[namespace]
    );

    expect(uncovered).toEqual([]);
  });

  test("allowlist entries include reasons", () => {
    for (const [namespace, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.trim().length, namespace).toBeGreaterThan(20);
    }
  });

  test("CLI/TUI local caller appRouter includes every Nest-mounted tRPC namespace", async () => {
    const nestRouterSource = await readFile(new URL("../trpc.router.ts", import.meta.url), "utf-8");
    const nestNamespaces = [...nestRouterSource.matchAll(/^      ([a-zA-Z_][a-zA-Z0-9_]*): /gm)]
      .map((match) => match[1]!)
      .filter((namespace) => !namespace.endsWith("Subscriptions"))
      .filter((namespace) => namespace !== "ping")
      .sort();
    const localCallerNamespaces = procedureNamespaces();

    expect(localCallerNamespaces).toEqual(expect.arrayContaining(nestNamespaces));
  });
});
