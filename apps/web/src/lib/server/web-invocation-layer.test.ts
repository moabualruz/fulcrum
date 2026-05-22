import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migratedRoutes = [
  "apps/web/src/routes/+page.server.ts",
  "apps/web/src/routes/settings/secrets/+page.server.ts",
  "apps/web/src/routes/settings/feature-flags/+page.server.ts",
  "apps/web/src/routes/settings/orchestration/+page.server.ts",
  "apps/web/src/routes/settings/orchestration/workflows/[id]/+page.server.ts",
  "apps/web/src/routes/settings/data/+page.server.ts",
  "apps/web/src/routes/settings/backups/+page.server.ts",
  "apps/web/src/routes/boards/+page.server.ts",
  "apps/web/src/routes/orchestration/+page.server.ts",
] as const;

describe("web invocation-layer routes", () => {
  test.each(migratedRoutes)("%s calls public API clients instead of opening an in-process database", (route) => {
    const source = readFileSync(join(process.cwd(), route), "utf8");

    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("initDatabase");
    expect(source).not.toContain("getDatabase");
    expect(source).not.toContain("EntityManager");
  });
});
