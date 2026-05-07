import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

const requiredRoutes = [
  "/projects",
  "/projects/[id]/board",
  "/projects/[id]/list",
  "/projects/[id]/calendar",
  "/projects/[id]/gantt",
  "/projects/[id]/reports",
  "/docs",
  "/docs/[id]/edit",
  "/memory",
  "/search",
  "/repos",
  "/artifacts",
  "/inbox",
  "/runs",
  "/settings/api",
] as const;

const routeFiles: Record<(typeof requiredRoutes)[number], string> = {
  "/projects": "src/routes/projects/+page.svelte",
  "/projects/[id]/board": "src/routes/projects/[id]/board/+page.svelte",
  "/projects/[id]/list": "src/routes/projects/[id]/list/+page.svelte",
  "/projects/[id]/calendar": "src/routes/projects/[id]/calendar/+page.svelte",
  "/projects/[id]/gantt": "src/routes/projects/[id]/gantt/+page.svelte",
  "/projects/[id]/reports": "src/routes/projects/[id]/reports/+page.svelte",
  "/docs": "src/routes/docs/+page.svelte",
  "/docs/[id]/edit": "src/routes/docs/[id]/edit/+page.svelte",
  "/memory": "src/routes/memory/+page.svelte",
  "/search": "src/routes/search/+page.svelte",
  "/repos": "src/routes/repos/+page.svelte",
  "/artifacts": "src/routes/artifacts/+page.svelte",
  "/inbox": "src/routes/inbox/+page.svelte",
  "/runs": "src/routes/runs/+page.svelte",
  "/settings/api": "src/routes/settings/api/+page.svelte",
};

const operationalHooks: Record<string, string[]> = {
  "/projects/[id]/board": ["data-project-board-grid", "data-swimlane-toggle", "data-sprint-filter-chip"],
  "/search": ["data-search-input", "data-facet-panel", "data-search-form"],
  "/repos": ["data-repos-header", "data-repo-row", "data-add-repo-form"],
  "/artifacts": ["data-artifacts-header", "data-artifacts-filter", "data-artifacts-list"],
  "/inbox": ["data-inbox-tabs", "role=\"tablist\"", "data-tab-foryou"],
  "/runs": ["data-runs-header", "data-runs-dispatch", "data-runs-filter"],
  "/docs": ["data-docs-header", "data-docs-hub", "data-docs-filter"],
  "/docs/[id]/edit": ["data-doc-edit-header", "data-doc-edit-form", "real-time-collab-server"],
  "/memory": ["data-memory-browser", "data-memory-filter", "data-memory-bulk-bar"],
  "/settings/api": ["data-settings-api", "/api/v1/openapi.json", "data-api-rate-limit-status"],
};

const forbiddenSlop = [
  "gradient-orb",
  "orb",
  "bokeh",
  "hero",
  "marketing",
  "landing",
  "linear-gradient",
];

function readRoute(route: keyof typeof routeFiles): string {
  return readFileSync(join(root, routeFiles[route]), "utf8");
}

describe("Phase 08 route render inventory", () => {
  test("includes every required WEB-10 route string", () => {
    expect(requiredRoutes).toEqual([
      "/projects",
      "/projects/[id]/board",
      "/projects/[id]/list",
      "/projects/[id]/calendar",
      "/projects/[id]/gantt",
      "/projects/[id]/reports",
      "/docs",
      "/docs/[id]/edit",
      "/memory",
      "/search",
      "/repos",
      "/artifacts",
      "/inbox",
      "/runs",
      "/settings/api",
    ]);
    for (const route of requiredRoutes) {
      expect(existsSync(join(root, routeFiles[route]))).toBe(true);
    }
  });

  test("Huashu route family consistency keeps operational hooks visible", () => {
    for (const [route, hooks] of Object.entries(operationalHooks)) {
      const source = readRoute(route as keyof typeof routeFiles);
      for (const hook of hooks) {
        expect(source, `${route} missing ${hook}`).toContain(hook);
      }
    }
  });

  test("Huashu anti-AI-slop guard rejects decorative Web completion patterns", () => {
    for (const route of requiredRoutes) {
      const source = readRoute(route).toLowerCase();
      for (const forbidden of forbiddenSlop) {
        expect(source, `${route} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  test("settings API route renders OpenAPI, API key, and rate-limit status surfaces", () => {
    const server = readFileSync(join(root, "src/routes/settings/api/+page.server.ts"), "utf8");
    const page = readRoute("/settings/api");
    expect(server).toContain("openApiUrl");
    expect(server).toContain("rateLimit");
    expect(page).toContain("data-api-key-status");
    expect(page).toContain("data-api-rate-limit-status");
    expect(page).toContain("/api/v1/openapi.json");
  });
});
