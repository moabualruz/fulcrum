import { describe, expect, test } from "bun:test";

import {
  createDataSourceOptions,
} from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";

describe("application database TypeORM config", () => {
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
