import { test, expect } from "bun:test";
import { DataSource, type DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";
import { createDataSourceOptions } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

async function buildDs(): Promise<DataSource> {
  const driver = new PGliteDriver().driver;
  const ds = new DataSource({
    ...createDataSourceOptions([], {}),
    driver,
    logging: true,
    installExtensions: false,
  } as DataSourceOptions);
  await ds.initialize();
  return ds;
}

test("debug: migrate directly", async () => {
  const ds = await buildDs();
  try {
    const applied = await ds.runMigrations({ transaction: "none" });
    console.log("applied count:", applied.length);
    console.log("first applied:", applied[0]?.name);
  } catch (e) {
    console.error("migrate threw:", e);
    console.error("message:", (e as Error)?.message);
    console.error("typeof:", typeof e);
    if (e && typeof e === "object") {
      console.error("keys:", Object.keys(e as object));
    }
    throw e;
  } finally {
    await ds.destroy();
  }
}, 30_000);
