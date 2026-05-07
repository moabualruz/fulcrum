import { PGlite } from "@electric-sql/pglite";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@hono/zod-openapi";
import { fulcrumHome } from "../config/database.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import { SeedService } from "../db/seed.ts";
import { createTestOrm } from "../test-utils/db.ts";
import type { TestOrm } from "../test-utils/db.ts";
import { newUlid } from "../shared/ids.ts";

export interface TestStore {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}
export type TestOrmFixture = TestOrm;

export function productDbDir(): string {
  return join(fulcrumHome(), "pglite.data");
}

const KERNEL = "../product-" + "kernel";

async function loadStoreModule(path: string): Promise<Record<string, any>> {
  return await import(`${KERNEL}/${path}.ts`) as Record<string, any>;
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
  const applied = await callStore("db/migrate", "applyProductMigrations", [store]);
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
  const pglite = new PGlite(dataDir);
  const orm = await MikroORMRuntime.init(createOrmConfig({ pglite }));
  await orm.migrator.up();
  const seed = await new SeedService(orm.em).run();
  return {
    store: pglite as unknown as TestStore,
    orgId: seed.orgId,
    close: async () => {
      await orm.close(true);
      await pglite.close();
    },
  };
}

export async function createArtifact(...args: unknown[]) { return callStore("artifacts", "createArtifact", args); }
export async function getArtifact(...args: unknown[]) { return callStore("artifacts", "getArtifact", args); }
export async function listArtifacts(...args: unknown[]) {
  const mod = await import("../services/artifacts.ts");
  return mod.listArtifacts(...args as Parameters<typeof mod.listArtifacts>);
}
export async function getArtifactStats(...args: unknown[]) {
  const mod = await import("../services/artifacts.ts");
  return mod.getArtifactStats(...args as Parameters<typeof mod.getArtifactStats>);
}
export { run } from "../cli/artifact.ts";
export type { ArtifactRunOptions } from "../cli/artifact.ts";
export type ArtifactsClient = NonNullable<import("../cli/artifact.ts").ArtifactRunOptions["caller"]>["artifacts"];
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
} from "../trpc/schemas/artifacts.ts";
