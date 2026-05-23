import { afterAll, beforeAll, beforeEach } from "vitest";
import type { DataSource } from "typeorm";

import { createTestDataSource, truncateTestDataSource } from "../../../tests/setup/db.ts";

let dataSource: DataSource | null = null;

beforeAll(async () => {
  dataSource = await createTestDataSource();
});

beforeEach(async () => {
  if (dataSource?.isInitialized) await truncateTestDataSource(dataSource);
});

afterAll(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  dataSource = null;
});

export function getServerTestDataSource(): DataSource {
  if (!dataSource?.isInitialized) throw new Error("server test DataSource is not initialized");
  return dataSource;
}
