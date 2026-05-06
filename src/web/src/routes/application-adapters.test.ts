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
    helperModule: "$lib/product-queries",
    keys: ["activeProjectId", "streamed", "data", "projects"],
  },
  {
    name: "runs",
    file: "runs/+page.server.ts",
    applicationModule: "application/runs/queries",
    keys: ["activeProjectId", "filter", "streamed", "data", "runs", "projects", "tasks"],
  },
  {
    name: "docs",
    file: "docs/+page.server.ts",
    applicationModule: "application/docs/queries",
    keys: ["activeProjectId", "kind", "q", "streamed", "data", "documents", "projectTree", "globalTree"],
  },
  {
    name: "artifacts",
    file: "artifacts/+page.server.ts",
    applicationModule: "application/artifacts/queries",
    keys: ["activeProjectId", "filter", "streamed", "data", "artifacts"],
  },
  {
    name: "audit",
    file: "audit/+page.server.ts",
    applicationModule: "application/audit/queries",
    keys: ["events", "total", "page", "actor", "kind", "verb", "project", "dateFrom", "dateTo"],
  },
  {
    name: "memory",
    file: "memory/+page.server.ts",
    applicationModule: "application/memory/queries",
    keys: ["activeProjectId", "scope", "kind", "streamed", "data", "memories"],
  },
  {
    name: "tasks",
    file: "tasks/[id]/+page.server.ts",
    applicationModule: "application/tasks/queries",
    keys: ["task", "children"],
  },
  {
    name: "boards",
    file: "boards/+page.server.ts",
    applicationModule: "application/tasks/queries",
    keys: ["project", "activeProjectId", "streamed", "data", "tasks"],
  },
];

const RUNTIME_SURFACES: RuntimeSurface[] = [
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
    });
  }

  for (const surface of SURFACES) {
    test(`${surface.name} loader uses application query module and preserves page data keys`, () => {
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

  test("dashboard helper composes ORM/application queries without raw handles", () => {
    const text = readFileSync(join(webRoot, "lib/server/dashboard.ts"), "utf8");
    expect(text).toContain("application/docs/queries");
    expect(text).toContain("application/runs/queries");
    expect(text).toContain("application/tasks/queries");
    expect(text).not.toMatch(new RegExp(`open${productDbToken}|get${productDbToken}|Orm${productDbToken}|${productDbToken}`));
    expect(text).not.toMatch(/\.(query|execute)\(/);
  });
});
