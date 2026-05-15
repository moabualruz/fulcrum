import { test, expect } from "bun:test";
import { PGliteInstance } from "typeorm-pglite/dist/pglite-instance.js";
import { PGliteDriver } from "typeorm-pglite";
import { createDataSourceOptions } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { DataSource, type DataSourceOptions } from "typeorm";

test("debug: PGlite options", async () => {
  console.log("initial options:", (PGliteInstance as any).options);
  
  const dsopts = createDataSourceOptions([], {});
  console.log("after createDataSourceOptions, options:", (PGliteInstance as any).options);
  
  const driver = new PGliteDriver().driver;
  console.log("after new PGliteDriver(), options:", (PGliteInstance as any).options);
  
  const ds = new DataSource({
    ...dsopts,
    driver,
    logging: false,
    installExtensions: false,
  } as DataSourceOptions);
  
  await ds.initialize();
  console.log("after initialize, options:", (PGliteInstance as any).options);
  
  // Check if schema_migrations exists
  try {
    const result = await ds.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'schema_migrations'");
    console.log("schema_migrations count:", result);
  } catch (e) {
    console.log("schema check error:", e);
  }
  
  await ds.destroy();
});
