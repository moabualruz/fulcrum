import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const W8_W9_APP_SURFACES = [
  "apps/web/src/routes/projects/[id]/board/+page.server.ts",
  "apps/web/src/routes/projects/[id]/board/+page.svelte",
  "apps/web/src/routes/projects/[id]/runs/[runId]/+page.server.ts",
  "apps/web/src/routes/projects/[id]/runs/[runId]/+page.svelte",
  "apps/web/src/routes/tasks/[id]/+page.server.ts",
  "apps/web/src/routes/tasks/[id]/+page.svelte",
  "apps/web/src/routes/tasks/[id]/run-feedback/+server.ts",
  "apps/cli/src/product.ts",
  "apps/tui/src/index.ts",
  "apps/tui/src/screens/task-list.ts",
] as const;

const FORBIDDEN_PATTERNS = [
  /@[^"']+\/application\//,
  /@[^"']+\/infrastructure\//,
  /from\s+["']typeorm["']/,
  /@mikro-orm/,
  /\bkysely\b/i,
  /\bem\.find\b|\bem\.save\b|\bem\.remove\b|\bem\.query\b/,
  /\.getRepository\(/,
] as const;

describe("W8/W9 app-surface boundary", () => {
  for (const file of W8_W9_APP_SURFACES) {
    test(`${file} stays invocation/visualization only`, () => {
      const source = readFileSync(file, "utf8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
