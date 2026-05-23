import { afterEach, describe, expect, test } from "bun:test";
import { EntitySchema, type DataSource } from "typeorm";

import { createTestDataSource, truncateTestDataSource } from "../../../tests/setup/db.ts";

interface SmokeRecord {
  id: string;
  name: string;
}

const SmokeEntity = new EntitySchema<SmokeRecord>({
  name: "SmokeRecord",
  tableName: "smoke_records",
  columns: {
    id: { type: String, primary: true },
    name: { type: String },
  },
});

let dataSource: DataSource | null = null;

afterEach(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  dataSource = null;
});

describe("server PGlite TypeORM setup", () => {
  test("persists, truncates, and queries through a real TypeORM DataSource", async () => {
    dataSource = await createTestDataSource({ entities: [SmokeEntity] });
    const repo = dataSource.getRepository(SmokeEntity);

    await repo.save({ id: "smoke-1", name: "Smoke test" });
    expect(await repo.findOneBy({ id: "smoke-1" })).toMatchObject({ name: "Smoke test" });

    await truncateTestDataSource(dataSource);
    expect(await repo.count()).toBe(0);
  });
});
