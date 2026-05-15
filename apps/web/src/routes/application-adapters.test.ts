import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routesRoot = import.meta.dir;
const webRoot = join(routesRoot, "..");

type Surface = {
  name: string;
  file: string;
  applicationModule: string | null;
  helperModule?: string;
  keys: string[];
};

type RuntimeSurface = {
  name: string;
  file: string;
};

const SURFACES: Surface[] = [
  {
    name: "auth login",
    file: "auth/login/+page.server.ts",
    applicationModule: null,
    helperModule: "@identity-access/interface/auth-feature",
    keys: ["saasAuthEnabled"],
  },
  {
    name: "auth signup",
    file: "auth/signup/+page.server.ts",
    applicationModule: null,
    helperModule: "@identity-access/interface/auth-feature",
    keys: ["_isSaasAuthEnabled"],
  },
  {
    name: "dashboard",
    file: "+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/dashboard",
    keys: ["activeProjectId", "streamed", "dashboard"],
  },
  {
    name: "projects",
    file: "projects/+page.server.ts",
    applicationModule: null,
    helperModule: "@work-management/interface/project-lifecycle",
    keys: ["activeProjectId", "streamed", "data", "projects"],
  },
  {
    name: "runs",
    file: "runs/+page.server.ts",
    applicationModule: null,
    helperModule: "@execution-orchestration/interface/run-pages",
    keys: ["activeProjectId", "filter", "streamed", "data", "runs", "projects", "tasks"],
  },
  {
    name: "docs",
    file: "docs/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/document-api",
    keys: ["activeProjectId", "kind", "q", "streamed", "data", "documents", "projectTree", "globalTree"],
  },
  {
    name: "artifacts",
    file: "artifacts/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/artifact-api",
    keys: ["activeProjectId", "filter", "streamed", "data", "artifacts"],
  },
  {
    name: "run artifacts",
    file: "runs/[id]/artifacts/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/artifact-api",
    keys: ["runId", "activeProjectId", "streamed", "data", "artifacts"],
  },
  {
    name: "project artifacts",
    file: "projects/[id]/artifacts/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/artifact-api",
    keys: ["projectId", "activeProjectId", "streamed", "data", "artifacts", "stats"],
  },
  {
    name: "audit",
    file: "audit/+page.server.ts",
    applicationModule: null,
    helperModule: "@workflow-coordination/interface/http/audit-api-client",
    keys: ["events", "total", "page", "actor", "kind", "verb", "project", "dateFrom", "dateTo"],
  },
  {
    name: "inbox",
    file: "inbox/+page.server.ts",
    applicationModule: null,
    helperModule: "@notification-center/interface/http/notification-api-client",
    keys: ["notifications", "unreadCount", "activity", "activityPage", "activityTotal"],
  },
  {
    name: "memory",
    file: "memory/+page.server.ts",
    applicationModule: null,
    helperModule: "@knowledge-workspace/interface/memory-records",
    keys: ["activeProjectId", "scope", "kind", "streamed", "data", "memories"],
  },
  {
    name: "search",
    file: "search/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/search-api",
    keys: ["q", "kinds", "dateFrom", "dateTo", "hits", "grouped", "savedSearches"],
  },
  {
    name: "project custom fields settings",
    file: "projects/[id]/settings/fields/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/custom-field-api",
    keys: ["fields", "projectId"],
  },
  {
    name: "project saved views settings",
    file: "projects/[id]/settings/views/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/saved-view-api",
    keys: ["views", "projectId"],
  },
  {
    name: "project document templates settings",
    file: "projects/[id]/settings/templates/+page.server.ts",
    applicationModule: null,
    helperModule: "@knowledge-workspace/interface/document-templates",
    keys: ["templates", "projectId"],
  },
  {
    name: "settings error logs",
    file: "settings/errors/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/error-log-api",
    keys: ["page", "streamed", "data", "errors", "total", "pageSize"],
  },
  {
    name: "settings notification retention",
    file: "settings/notifications/+page.server.ts",
    applicationModule: null,
    helperModule: "@workflow-coordination/interface/http/audit-api-client",
    keys: ["retainDays", "saved", "retentionPolicy"],
  },
  {
    name: "settings connectors",
    file: "settings/connectors/+page.server.ts",
    applicationModule: null,
    helperModule: "$lib/server/connector-api",
    keys: ["connectors", "syncLog", "saveOk", "syncOk"],
  },
  {
    name: "settings billing",
    file: "settings/billing/+page.server.ts",
    applicationModule: null,
    helperModule: "@identity-access/interface/auth-feature",
    keys: ["billingEnabled"],
  },
  {
    name: "settings inference",
    file: "settings/inference/+page.server.ts",
    applicationModule: null,
    helperModule: "@platform-core/interface/http/inference-api-client",
    keys: ["activeProjectId", "streamed", "inference", "health"],
  },
  {
    name: "settings document templates",
    file: "settings/templates/+page.server.ts",
    applicationModule: null,
    helperModule: "@knowledge-workspace/interface/document-templates",
    keys: ["templates", "projectId"],
  },
  {
    name: "settings database migrations",
    file: "settings/database/migrations/+page.server.ts",
    applicationModule: null,
    helperModule: "@platform-core/interface/database-status",
    keys: ["database", "status", "history"],
  },
  {
    name: "tasks",
    file: "tasks/[id]/+page.server.ts",
    applicationModule: null,
    helperModule: "@work-management/interface/work-item-detail",
    keys: ["task", "children"],
  },
  {
    name: "boards",
    file: "boards/+page.server.ts",
    applicationModule: null,
    helperModule: "@work-management/interface/work-item-detail",
    keys: ["project", "activeProjectId", "streamed", "data", "tasks"],
  },
];

const RUNTIME_SURFACES: RuntimeSurface[] = [
  { name: "repo tree API", file: "api/repos/[id]/tree/+server.ts" },
  { name: "orchestration settings", file: "orchestration/+page.server.ts" },
  { name: "audit export", file: "audit/export/+server.ts" },
  { name: "runs detail", file: "runs/[id]/+page.server.ts" },
  { name: "run artifacts", file: "runs/[id]/artifacts/+page.server.ts" },
  { name: "CSV export/import", file: "api/data/export-csv/+server.ts" },
  { name: "CSV export/import", file: "api/data/import-csv/+server.ts" },
  { name: "skills API", file: "api/skills/+server.ts" },
  { name: "bell API", file: "api/bell/+server.ts" },
  { name: "search loader", file: "search/+page.server.ts" },
];

const productDbToken = "Product" + "Db";
const productKernelToken = "product" + "-kernel";
const FORBIDDEN_RUNTIME_BOUNDARY = new RegExp(
  [
    "open" + productDbToken,
    "get" + productDbToken,
    "Orm" + productDbToken,
    `\\b${productDbToken}\\b`,
    `from\\s+["'][^"']*${productKernelToken}[^"']*["']`,
    "\\.query\\(",
    "getConnection\\(\\)\\.execute",
  ].join("|"),
  "g",
);

const FORBIDDEN_WEB_ROUTE_ORCHESTRATION = new RegExp(
  [
    `from\\s+["'][^"']*data/(csv-import|csv-export)["']`,
    `for\\s*\\([^)]*of\\s+parsed\\.records\\)`,
    `mkdtemp\\(`,
    `writeFile\\(`,
    `Bun\\.file\\(`,
  ].join("|"),
);

function source(file: string): string {
  return readFileSync(join(routesRoot, file), "utf8");
}

function tokenPattern(key: string): RegExp {
  return new RegExp(`\\b${key}\\b`);
}

describe("web route application adapters", () => {
  for (const surface of RUNTIME_SURFACES) {
    test(`${surface.name} runtime adapter avoids direct ${productDbToken} and raw data access`, () => {
      const text = source(surface.file);
      const matches = [...text.matchAll(FORBIDDEN_RUNTIME_BOUNDARY)].map((match) => match[0]);
      expect(matches, `${surface.file} boundary violations: ${matches.join(", ")}`).toEqual([]);
      expect(text, `${surface.file} should call an application facade instead of owning CSV/file orchestration`).not.toMatch(FORBIDDEN_WEB_ROUTE_ORCHESTRATION);
    });
  }

  for (const surface of SURFACES) {
    test(`${surface.name} loader uses an adapter module and preserves page data keys`, () => {
      const text = source(surface.file);
      if (surface.applicationModule) {
        expect(text).toContain(surface.applicationModule);
      }
      if (surface.helperModule) {
        expect(text).toContain(surface.helperModule);
      }
      expect(text).not.toMatch(new RegExp(`open${productDbToken}|get${productDbToken}|Orm${productDbToken}|${productDbToken}`));
      expect(text).not.toMatch(/\.(query|execute)\(/);

      for (const key of surface.keys) {
        expect(text, `${surface.file} should still expose ${key}`).toMatch(tokenPattern(key));
      }
    });
  }

  test("web product query helpers no longer own raw data access", () => {
    const text = readFileSync(join(webRoot, "lib/product-queries.ts"), "utf8");
    expect(text).not.toMatch(new RegExp(`open${productDbToken}|get${productDbToken}|Orm${productDbToken}|${productDbToken}`));
    expect(text).not.toMatch(/\.(query|execute)\(/);
  });

  test("dashboard helper uses service interface without raw handles", () => {
    const text = readFileSync(join(webRoot, "lib/server/dashboard.ts"), "utf8");
    expect(text).toContain("@work-management/interface/dashboard");
    expect(text).not.toContain("application/docs/queries");
    expect(text).not.toContain("application/runs/queries");
    expect(text).not.toContain("application/tasks/queries");
    expect(text).not.toMatch(new RegExp(`open${productDbToken}|get${productDbToken}|Orm${productDbToken}|${productDbToken}`));
    expect(text).not.toMatch(/\.(query|execute)\(/);
  });
});
