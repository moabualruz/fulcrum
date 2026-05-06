import { PGlite } from "@electric-sql/pglite";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { openPglite as openStore } from "../product-kernel/db/pglite.ts";
import { applyProductMigrations as migrateStore } from "../product-kernel/db/migrate.ts";
import type { ProductDb as StoreHandle } from "../product-kernel/db/types.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import { SeedService } from "../db/seed.ts";
import { createTestOrm } from "../test-utils/db.ts";
import type { TestOrm } from "../test-utils/db.ts";

export type TestStore = StoreHandle;
export type TestOrmFixture = TestOrm;

export const openIsolatedStore = openStore;
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
export { newUlid as makeId } from "../product-kernel/ids.ts";
export {
  appendEvent,
  createLocalOrg,
  createProject,
  createSprint,
  createTask,
  listEventsForProject,
} from "../product-kernel/store/repositories.ts";
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
