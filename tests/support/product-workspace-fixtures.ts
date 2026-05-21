import { DataSource, type DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod/v4";
import { defaultLocalPgliteDataDir } from "@platform-core/application/db/database-config.ts";
import { createDataSourceOptions } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { applyProductMigrations } from "@platform-core/infrastructure/application-database/product-migrations.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "./application-database.ts";
import type { TestOrm } from "./application-database.ts";
import { newUlid } from "@platform-core/application/platform-primitives/monotonic-id.ts";

export interface TestStore {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}
export type TestOrmFixture = TestOrm;

export function productDbDir(): string {
  return defaultLocalPgliteDataDir();
}

const STORE_MODULE_ROOT = "@platform-core/infrastructure/product-store";

async function loadStoreModule(path: string): Promise<Record<string, any>> {
  return await import(`${STORE_MODULE_ROOT}/${path}.ts`) as Record<string, any>;
}

async function callStore(path: string, name: string, args: unknown[]): Promise<any> {
  const mod = await loadStoreModule(path);
  const fn = mod[name];
  if (typeof fn !== "function") throw new Error(`Missing fixture export ${name}`);
  return await fn(...args);
}

export async function openIsolatedStore(dataDir: string): Promise<TestStore> {
  return await callStore("db/pglite", "open" + "Pglite", [dataDir]) as TestStore;
}
export async function migrateIsolatedStore(store: TestStore): Promise<unknown> {
  const applied = await applyProductMigrations(store);
  await store.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate integer`);
  return applied;
}
export const createIsolatedOrmFixture = createTestOrm;

export async function createApplicationStoreFixture(dataDir: string): Promise<{
  store: TestStore;
  orgId: string;
  close: () => Promise<void>;
}> {
  await mkdir(dirname(dataDir), { recursive: true });
  const driver = new PGliteDriver({ dataDir }).driver;
  const ds = new DataSource({
    ...createDataSourceOptions([], {}),
    driver,
  } as DataSourceOptions);
  await ds.initialize();
  await ds.runMigrations({ transaction: "none" });
  const seed = await new SeedService(ds.manager).run();
  return {
    store: ds.manager as unknown as TestStore,
    orgId: seed.orgId,
    close: async () => {
      await ds.destroy();
    },
  };
}

export async function createArtifact(...args: unknown[]) { return callStore("artifacts", "createArtifact", args); }
export async function getArtifact(...args: unknown[]) { return callStore("artifacts", "getArtifact", args); }
export async function listArtifacts(...args: unknown[]) {
  const mod = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return mod.listArtifacts(...args as Parameters<typeof mod.listArtifacts>);
}
export async function getArtifactStats(...args: unknown[]) {
  const mod = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return mod.getArtifactStats(...args as Parameters<typeof mod.getArtifactStats>);
}
export { run } from "@fulcrum/cli/artifact.ts";
export type { ArtifactRunOptions } from "@fulcrum/cli/artifact.ts";
export type ArtifactsClient = NonNullable<import("@fulcrum/cli/artifact.ts").ArtifactRunOptions["caller"]>["artifacts"];
export const makeId = newUlid;
export type SqlValue = string | number | boolean | null | Uint8Array;
export interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}
export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}
export type SymphonyRunRow = Record<string, unknown>;

export async function addTaskToSprint(...args: unknown[]) { return callStore("store/repositories", "addTaskToSprint", args); }
export async function appendEvent(...args: unknown[]) { return callStore("store/repositories", "appendEvent", args); }
export async function closeSprint(...args: unknown[]) { return callStore("store/repositories", "closeSprint", args); }
export async function createLocalOrg(...args: unknown[]) { return callStore("store/repositories", "createLocalOrg", args); }
export async function createProject(...args: unknown[]) { return callStore("store/repositories", "createProject", args); }
export async function createSprint(...args: unknown[]) { return callStore("store/repositories", "createSprint", args); }
export async function createTask(...args: unknown[]) { return callStore("store/repositories", "createTask", args); }
export async function listEventsForProject(...args: unknown[]) { return callStore("store/repositories", "listEventsForProject", args); }
export async function listEventsFiltered(...args: unknown[]) { return callStore("store/repositories", "listEventsFiltered", args); }

/**
 * Test fixture: events for a single subject (entity), newest first.
 *
 * The product store exposes `listEventsForProject` / `listEventsFiltered` but
 * no per-entity query, so this fixture issues the entity-scoped read directly
 * against the `events` table — the same table `appendEvent` writes. Used by the
 * `/projects/[id]/activity` route test's per-entity activity coverage.
 */
export async function listEventsForEntity(
  db: TestStore,
  subjectKind: string,
  subjectId: string,
  options: { limit?: number } = {},
): Promise<EventRow[]> {
  const limit = options.limit ?? 50;
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM events
      WHERE subject_kind = $1 AND subject_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [subjectKind, subjectId, limit],
  );
  return rows.map((r) => ({
    id: r["id"] as string,
    org_id: r["org_id"] as string,
    project_id: (r["project_id"] as string | null) ?? null,
    actor: (r["actor"] as string) ?? "system",
    subject_kind: r["subject_kind"] as string,
    subject_id: r["subject_id"] as string,
    verb: r["verb"] as string,
    payload: (r["payload"] as Record<string, unknown>) ?? {},
    created_at: String(r["created_at"]),
  }));
}

export async function getBlameForFile(...args: unknown[]) { return callStore("store/repo-files", "getBlameForFile", args); }
export async function getFileContent(...args: unknown[]) { return callStore("store/repo-files", "getFileContent", args); }
export async function insertBlameLine(...args: unknown[]) { return callStore("store/repo-files", "insertBlameLine", args); }
export async function insertRepoFile(...args: unknown[]) { return callStore("store/repo-files", "insertRepoFile", args); }
export async function listIndexedBranches(...args: unknown[]) { return callStore("store/repo-files", "listIndexedBranches", args); }
export async function listTreeChildren(...args: unknown[]) { return callStore("store/repo-files", "listTreeChildren", args); }
export async function getFileByPath(...args: unknown[]) { return callStore("store/repo-files", "getFileByPath", args); }
export async function upsertFileContent(...args: unknown[]) { return callStore("store/repo-files", "upsertFileContent", args); }

const symphonyStore = await loadStoreModule("symphony");
const symphonyHttpApi = await loadStoreModule("symphony/http-api");

export const clearHooks = symphonyStore["clearHooks"] as () => void;
export const createRun = symphonyStore["createRun"] as (...args: unknown[]) => Promise<unknown>;
export const registerHook = symphonyStore["registerHook"] as (...args: unknown[]) => () => void;
export const createHttpApiRoutes = symphonyHttpApi["createHttpApiRoutes"] as (...args: unknown[]) => unknown;

const TaskStatus = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);

export const CreateTaskBody = z.object({
  project_id: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: TaskStatus.optional(),
  priority: z.number().int().optional(),
});
export {
  ArchiveArtifactOutputSchema,
  ArtifactIdInputSchema,
  ArtifactSchema,
  DeleteArtifactInputSchema,
  DeleteArtifactOutputSchema,
  DownloadArtifactOutputSchema,
  ListArtifactsInputSchema,
  UploadArtifactInputSchema,
} from "@fulcrum/server/trpc/schemas/artifacts.ts";
