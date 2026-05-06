import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routesRoot = import.meta.dir;
const webRoot = join(routesRoot, "..");

type Surface = {
  name: string;
  file: string;
  applicationModule: string;
  keys: string[];
};

const SURFACES: Surface[] = [
  {
    name: "dashboard",
    file: "+page.server.ts",
    applicationModule: "application/dashboard/queries",
    keys: ["activeProjectId", "streamed", "dashboard"],
  },
  {
    name: "projects",
    file: "projects/+page.server.ts",
    applicationModule: "application/projects/queries",
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

function source(file: string): string {
  return readFileSync(join(routesRoot, file), "utf8");
}

function tokenPattern(key: string): RegExp {
  return new RegExp(`\\b${key}\\b`);
}

describe("web route application adapters", () => {
  for (const surface of SURFACES) {
    test(`${surface.name} loader uses application query module and preserves page data keys`, () => {
      const text = source(surface.file);
      expect(text).toContain(surface.applicationModule);
      expect(text).not.toMatch(/openProductDb|getProductDb|OrmProductDb|ProductDb/);
      expect(text).not.toMatch(/\.(query|execute)\(/);

      for (const key of surface.keys) {
        expect(text, `${surface.file} should still expose ${key}`).toMatch(tokenPattern(key));
      }
    });
  }

  test("web product query helpers no longer own raw data access", () => {
    const text = readFileSync(join(webRoot, "lib/product-queries.ts"), "utf8");
    expect(text).not.toMatch(/openProductDb|getProductDb|OrmProductDb|ProductDb/);
    expect(text).not.toMatch(/\.(query|execute)\(/);
  });
});
