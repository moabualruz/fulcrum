import { openPglite as openStore } from "../product-kernel/db/pglite.ts";
import { applyProductMigrations as migrateStore } from "../product-kernel/db/migrate.ts";
import type { ProductDb as StoreHandle } from "../product-kernel/db/types.ts";
import { createTestOrm } from "../test-utils/db.ts";
import type { TestOrm } from "../test-utils/db.ts";

export type TestStore = StoreHandle;
export type TestOrmFixture = TestOrm;

export const openIsolatedStore = openStore;
export const migrateIsolatedStore = migrateStore;
export const createIsolatedOrmFixture = createTestOrm;

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
