import { PGlite } from "@electric-sql/pglite";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { openPglite as openStore } from "../product-kernel/db/pglite.ts";
import { applyProductMigrations as migrateStore } from "../product-kernel/db/migrate.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import { SeedService } from "../db/seed.ts";
import { createTestOrm } from "../test-utils/db.ts";
import type { TestOrm } from "../test-utils/db.ts";

export interface TestStore {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}
export type TestOrmFixture = TestOrm;

export async function openIsolatedStore(dataDir: string): Promise<TestStore> {
  return await openStore(dataDir) as unknown as TestStore;
}
export const migrateIsolatedStore = migrateStore;
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

export { createArtifact } from "../product-kernel/artifacts.ts";
export { getArtifact, listArtifacts } from "../product-kernel/artifacts.ts";
export { run } from "../cli/artifact.ts";
export type { ArtifactRunOptions } from "../cli/artifact.ts";
export type ArtifactsClient = NonNullable<import("../cli/artifact.ts").ArtifactRunOptions["caller"]>["artifacts"];
export { newUlid as makeId } from "../product-kernel/ids.ts";
export type { SqlValue } from "../product-kernel/db/types.ts";
export {
  addTaskToSprint,
  appendEvent,
  closeSprint,
  createLocalOrg,
  createProject,
  createSprint,
  createTask,
  listEventsForProject,
} from "../product-kernel/store/repositories.ts";
export type { EventRow, OrgRow } from "../product-kernel/store/repositories.ts";
export {
  getBlameForFile,
  getFileContent,
  insertBlameLine,
  insertRepoFile,
  listIndexedBranches,
  listTreeChildren,
  getFileByPath,
  upsertFileContent,
} from "../product-kernel/store/repo-files.ts";
export {
  clearHooks,
  createRun,
  registerHook,
} from "../product-kernel/symphony.ts";
export type { SymphonyRunRow } from "../product-kernel/symphony.ts";
export { createHttpApiRoutes } from "../product-kernel/symphony/http-api.ts";
export { CreateTaskBody } from "../product-kernel/api/schemas.ts";
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
