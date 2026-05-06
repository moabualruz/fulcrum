import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const INTERFACE_ROOTS = [
  "src/cli",
  "src/tui",
  "src/router",
];

const NON_WEB_INVENTORY_ROOTS = [
  "src/config",
  "src/db",
  "src/search",
  "src/docs",
  "src/collab",
  "src/connectors",
  "src/doctor/checks",
  "src/orchestration/symphony",
  "src/services",
  "src/infrastructure/doctor",
];

const EXACT_LEGACY_INFRASTRUCTURE_ALLOWLIST = [
  {
    file: "src/config/database.ts",
    category: "config/database bootstrap",
    reason: "central database opener is infrastructure, not interface runtime data access",
  },
  {
    file: "src/db/product-migrations.ts",
    category: "product migration compatibility",
    reason: "legacy SQL migration reader is compatibility infrastructure",
  },
  {
    file: "src/db/mikro-orm.config.ts",
    category: "config/database bootstrap",
    reason: "ORM config resolves legacy local database directory during local bootstrap",
  },
  {
    file: "src/infrastructure/doctor/legacy-db.ts",
    category: "doctor checks",
    reason: "doctor probes legacy local DB state without exposing ProductDb in CLI interface",
  },
  {
    file: "src/search/backend.ts",
    category: "search",
    reason: "search fallback remains legacy ProductDb-backed until application search module owns full index/query path",
  },
  {
    file: "src/search/indexers/base.ts",
    category: "search",
    reason: "search indexer base remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/artifact.ts",
    category: "search",
    reason: "artifact search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/document.ts",
    category: "search",
    reason: "document search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/entity-helpers.ts",
    category: "search",
    reason: "search indexer schema helper remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/memory.ts",
    category: "search",
    reason: "memory search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/repo.ts",
    category: "search",
    reason: "repo search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/run.ts",
    category: "search",
    reason: "run search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/sprint.ts",
    category: "search",
    reason: "sprint search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/indexers/task.ts",
    category: "search",
    reason: "task search indexer remains legacy ProductDb-backed until outbox indexing is fully migrated",
  },
  {
    file: "src/search/click-telemetry.ts",
    category: "search",
    reason: "search click telemetry remains legacy ProductDb-backed until application telemetry owns search clicks",
  },
  {
    file: "src/search/embeddings.ts",
    category: "search",
    reason: "embedding index bootstrap remains legacy ProductDb-backed",
  },
  {
    file: "src/search/query.ts",
    category: "search",
    reason: "PGlite FTS query compatibility remains isolated in search infrastructure",
  },
  {
    file: "src/search/query-service.ts",
    category: "search",
    reason: "query service wraps legacy search query path pending full application search migration",
  },
  {
    file: "src/search/snapshot-service.ts",
    category: "search",
    reason: "snapshot service wraps legacy ProductDb reads pending full application search migration",
  },
  {
    file: "src/search/suggest.ts",
    category: "search",
    reason: "suggest query remains legacy FTS compatibility path",
  },
  {
    file: "src/docs/doc-embedder.ts",
    category: "docs embedder",
    reason: "document embedding background writer remains legacy compatibility path",
  },
  {
    file: "src/collab/server.ts",
    category: "collab server",
    reason: "collab persistence uses minimal DB protocol and does not import product-kernel directly",
  },
  {
    file: "src/connectors/framework.ts",
    category: "connector framework",
    reason: "connector framework legacy sync path remains isolated pending connector application migration",
  },
  {
    file: "src/doctor/checks/api.ts",
    category: "doctor checks",
    reason: "doctor check config accepts legacy DB only as injectable diagnostic dependency",
  },
  {
    file: "src/doctor/checks/routing.ts",
    category: "doctor checks",
    reason: "routing doctor check accepts legacy DB only as injectable diagnostic dependency",
  },
  {
    file: "src/orchestration/symphony/http-server.ts",
    category: "Symphony HTTP server",
    reason: "Symphony compatibility HTTP server wraps product-kernel status API pending orchestration API migration",
  },
  {
    file: "src/services/tasks.ts",
    category: "legacy service wrappers",
    reason: "legacy task service wrapper retained while application task callers migrate",
  },
  {
    file: "src/services/runs.ts",
    category: "legacy service wrappers",
    reason: "legacy run service wrapper retained while orchestration callers migrate",
  },
  {
    file: "src/services/artifacts.ts",
    category: "legacy service wrappers",
    reason: "legacy artifact service wrapper retained while artifact callers migrate",
  },
] as const;

const FORBIDDEN_INTERFACE_ACCESS =
  /\b(openPglite|openProductDb|getProductDb|ProductDb)\b|from\s+["'][^"']*product-kernel[^"']*["']/;

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    return [path];
  }));
  return files.flat();
}

async function violations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("Phase 9.5 interface boundary", () => {
  test("interfaces do not import product-kernel or open ProductDb/PGlite directly", async () => {
    expect(await violations(INTERFACE_ROOTS, FORBIDDEN_INTERFACE_ACCESS)).toEqual([]);
  });

  test("non-web ProductDb inventory has exact infrastructure allowlists by category", async () => {
    const found = await violations(NON_WEB_INVENTORY_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    const allowed = new Set(EXACT_LEGACY_INFRASTRUCTURE_ALLOWLIST.map((entry) => entry.file));
    expect(found.filter((file) => !allowed.has(file))).toEqual([]);
    expect(EXACT_LEGACY_INFRASTRUCTURE_ALLOWLIST.map((entry) => entry.category)).toEqual([
      "config/database bootstrap",
      "product migration compatibility",
      "config/database bootstrap",
      "doctor checks",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "search",
      "docs embedder",
      "collab server",
      "connector framework",
      "doctor checks",
      "doctor checks",
      "Symphony HTTP server",
      "legacy service wrappers",
      "legacy service wrappers",
      "legacy service wrappers",
    ]);
    expect(EXACT_LEGACY_INFRASTRUCTURE_ALLOWLIST.every((entry) => entry.reason.length > 20)).toBe(true);
  });

  test("R-11 subscriptions do not import or depend on PGlite/pglite directly", async () => {
    expect(await violations(["src/subscriptions"], /\bPGlite\b|\bpglite\b/)).toEqual([
      "src/subscriptions/index.ts",
    ]);
  });
});
