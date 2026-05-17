import { describe, expect, test } from "bun:test";

import {
  createDataSourceOptions,
} from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";

describe("application database TypeORM config", () => {
  test("does not depend on CommonJS __dirname for migration paths", async () => {
    const source = await Bun.file(new URL("./typeorm.config.ts", import.meta.url)).text();

    expect(source).not.toContain("__dirname");
    expect(source).toContain("applicationMigrations");
  });

  test("loads explicit migration classes instead of an unresolved runtime glob", () => {
    const options = createDataSourceOptions([], {
      FULCRUM_HOME: "/tmp/fulcrum-typeorm-config",
    });

    expect(options.migrations).toBeArray();
    expect(options.migrations).toHaveLength(29);
    expect(String(options.migrations?.[0])).not.toContain("*");
  });

  test("defaults to local PGlite through the shared database resolver", () => {
    const options = createDataSourceOptions([], {
      FULCRUM_HOME: "/tmp/fulcrum-typeorm-config",
    });

    expect(options).toMatchObject({
      type: "postgres",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      synchronize: false,
      logging: false,
    });
    expect((options as { driver?: unknown }).driver).toBeDefined();
    expect((options as { url?: string }).url).toBeUndefined();
  });

  test("uses FULCRUM_DATABASE_URL to switch to normal PostgreSQL", () => {
    const options = createDataSourceOptions([], {
      FULCRUM_HOME: "/tmp/fulcrum-typeorm-config",
      FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      TYPEORM_LOGGING: "true",
    });

    expect(options).toMatchObject({
      type: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      synchronize: false,
      logging: true,
    });
    expect((options as { driver?: unknown }).driver).toBeUndefined();
  });
});
