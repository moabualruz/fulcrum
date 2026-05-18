import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MODULE_METADATA } from "@nestjs/common/constants";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  ApplicationDatabaseModule,
  createFulcrumTypeOrmModuleOptions,
  fulcrumTypeOrmRootModule,
} from "./typeorm-root.module.ts";
import { AppModule } from "@fulcrum/server/app.module.ts";
import { createDataSourceOptions, resolveApplicationDatabaseRuntime } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FulcrumTypeOrmConnectionRuntime } from "@platform-core/infrastructure/database/typeorm-connection-runtime.ts";
import {
  FULCRUM_TYPEORM_MIGRATIONS_TABLE,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  resolveFulcrumTypeOrmConnection,
  resolveFulcrumTypeOrmConnectionTarget,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

const rootPackage = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../../package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

let runtime: FulcrumTypeOrmConnectionRuntime | undefined;

afterEach(async () => {
  if (runtime) {
    await runtime.close();
    runtime = undefined;
  }
});

describe("Nest + TypeORM persistence foundation", () => {
  test("pins the Nest, TypeORM, validation, OpenAPI, and PGlite socket packages", () => {
    expect(rootPackage.dependencies).toMatchObject({
      "@nestjs/common": "11.1.20",
      "@nestjs/config": "4.0.4",
      "@nestjs/core": "11.1.20",
      "@nestjs/platform-express": "11.1.20",
      "@nestjs/swagger": "11.4.2",
      "@nestjs/typeorm": "11.0.1",
      "@electric-sql/pglite-socket": "0.1.5",
      "class-transformer": "0.5.1",
      "class-validator": "0.15.1",
      "reflect-metadata": "0.2.2",
      "rxjs": "7.8.2",
      "typeorm": "0.3.29",
    });
  });

  test("platform database module owns a Nest TypeOrmModule.forRootAsync root import", () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ApplicationDatabaseModule,
    ) as unknown[];

    expect(imports).toContain(fulcrumTypeOrmRootModule);
    expect(fulcrumTypeOrmRootModule).toMatchObject({
      module: TypeOrmModule,
      imports: [
        expect.objectContaining({
          imports: [],
          providers: expect.arrayContaining([
            expect.objectContaining({ provide: "TypeOrmModuleOptions" }),
            FulcrumTypeOrmConnectionRuntime,
          ]),
          exports: expect.any(Array),
        }),
      ],
    });
  });

  test("root server app module imports the platform database module", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(imports).toContain(ApplicationDatabaseModule);
  });

  test("builds explicit Postgres options with migrations instead of synchronize", () => {
    const options = buildFulcrumTypeOrmOptions({
      source: "postgres",
      url: "postgres://fulcrum:fulcrum@localhost:5432/fulcrum",
      entities: [],
      migrations: [],
    });

    expect(options).toMatchObject({
      type: "postgres",
      url: "postgres://fulcrum:fulcrum@localhost:5432/fulcrum",
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      entities: [],
      migrations: [],
    });
  });

  test("resolves production Postgres and local PGlite socket through the same TypeORM Postgres driver", async () => {
    const postgresConnection = resolveFulcrumTypeOrmConnection({
      DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
    const pgliteSocketConnection = resolveFulcrumTypeOrmConnection({
      FULCRUM_TYPEORM_PGLITE_SOCKET_URL:
        "postgresql://fulcrum:fulcrum@127.0.0.1:6543/fulcrum_test",
    });

    expect(postgresConnection).toEqual({
      source: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
    expect(pgliteSocketConnection).toEqual({
      source: "pglite-socket",
      url: "postgresql://fulcrum:fulcrum@127.0.0.1:6543/fulcrum_test",
    });

    const moduleOptions = await createFulcrumTypeOrmModuleOptions({
      env: {
        FULCRUM_TYPEORM_PGLITE_SOCKET_URL:
          "postgresql://fulcrum:fulcrum@127.0.0.1:6543/fulcrum_test",
      },
      entities: [],
      migrations: [],
    });

    expect(moduleOptions.type).toBe("postgres");
    expect(moduleOptions.url).toBe(
      "postgresql://fulcrum:fulcrum@127.0.0.1:6543/fulcrum_test",
    );
  });

  test("defaults Nest TypeORM to managed local PGlite when no database URL exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-typeorm-local-"));
    runtime = new FulcrumTypeOrmConnectionRuntime();

    expect(resolveFulcrumTypeOrmConnectionTarget({ FULCRUM_HOME: home })).toEqual({
      source: "pglite",
      dataDir: join(home, "pglite.data"),
    });

    const moduleOptions = await createFulcrumTypeOrmModuleOptions(
      {
        env: { FULCRUM_HOME: home },
        entities: [],
        migrations: [],
      },
      runtime,
    );

    expect(moduleOptions.type).toBe("postgres");
    expect(moduleOptions.url).toMatch(
      /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\/postgres$/,
    );

    const dataSource = createFulcrumTypeOrmDataSource(moduleOptions);
    await dataSource.initialize();
    try {
      const rows = await dataSource.query("SELECT 1 AS ok") as Array<{ ok: number }>;
      expect(rows[0]?.ok).toBe(1);
    } finally {
      await dataSource.destroy();
    }
  });

  test("managed data source path switches from default PGlite to PostgreSQL without caller branching", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-typeorm-managed-switch-"));
    runtime = new FulcrumTypeOrmConnectionRuntime();

    const local = await runtime.createManagedDataSource({
      env: { FULCRUM_HOME: home },
      entities: [],
      migrations: [],
    });

    try {
      expect(local.dataSource.options).toMatchObject({
        type: "postgres",
        synchronize: false,
        migrationsRun: false,
      });
      expect((local.dataSource.options as { url?: string }).url).toMatch(
        /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\/postgres$/,
      );
      expect((runtime as unknown as { localSocket?: unknown }).localSocket).toBeDefined();

      const postgres = await runtime.createManagedDataSource({
        env: {
          FULCRUM_HOME: home,
          FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
        },
        entities: [],
        migrations: [],
      });

      try {
        expect(postgres.dataSource.options).toMatchObject({
          type: "postgres",
          url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
          synchronize: false,
          migrationsRun: false,
        });
        expect((runtime as unknown as { localSocket?: unknown }).localSocket).toBeUndefined();
      } finally {
        await postgres.close();
      }
    } finally {
      await local.close();
    }
  });

  test("FULCRUM_DATABASE_URL switches Nest TypeORM to PostgreSQL connection settings", () => {
    expect(resolveFulcrumTypeOrmConnectionTarget({
      FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    })).toEqual({
      source: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
  });

  test("normal PostgreSQL URL wins over a configured local PGlite socket URL", async () => {
    const env = {
      FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      FULCRUM_TYPEORM_PGLITE_SOCKET_URL:
        "postgresql://postgres:postgres@127.0.0.1:6543/postgres",
    };

    expect(resolveFulcrumTypeOrmConnectionTarget(env)).toEqual({
      source: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });

    const moduleOptions = await createFulcrumTypeOrmModuleOptions({
      env,
      entities: [],
      migrations: [],
    });

    expect(moduleOptions).toMatchObject({
      type: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
  });

  test("explicit PGlite socket mode keeps TypeORM migrations on the Postgres protocol path", async () => {
    const moduleOptions = await createFulcrumTypeOrmModuleOptions({
      env: {
        FULCRUM_TYPEORM_PGLITE_SOCKET_URL:
          "postgresql://postgres:postgres@127.0.0.1:6543/postgres",
      },
    });

    expect(moduleOptions).toMatchObject({
      type: "postgres",
      url: "postgresql://postgres:postgres@127.0.0.1:6543/postgres",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      synchronize: false,
      migrationsRun: true,
    });
    expect(moduleOptions.migrations).toBeArray();
    expect(moduleOptions.migrations!.length).toBeGreaterThan(0);
  });

  test("runtime closes managed local PGlite socket when switching to normal PostgreSQL", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-typeorm-switch-"));
    runtime = new FulcrumTypeOrmConnectionRuntime();

    await runtime.createOptions({
      env: { FULCRUM_HOME: home },
      entities: [],
      migrations: [],
    });
    expect((runtime as unknown as { localSocket?: unknown }).localSocket).toBeDefined();

    const moduleOptions = await runtime.createOptions({
      env: {
        FULCRUM_HOME: home,
        DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      },
      entities: [],
      migrations: [],
    });

    expect(moduleOptions).toMatchObject({
      type: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
    expect((runtime as unknown as { localSocket?: unknown }).localSocket).toBeUndefined();
  });

  test("invalid database URLs fail before Nest TypeORM can fall back to local PGlite", async () => {
    expect(() =>
      resolveFulcrumTypeOrmConnectionTarget({
        DATABASE_URL: "sqlite:///tmp/fulcrum.sqlite",
      })
    ).toThrow("DATABASE_URL must be a postgres:// or postgresql:// connection string");

    await expect(
      createFulcrumTypeOrmModuleOptions({
        env: {
          FULCRUM_HOME: "/tmp/fulcrum-local-home",
          FULCRUM_DATABASE_URL: "mysql://fulcrum:fulcrum@db:3306/fulcrum",
        },
        entities: [],
        migrations: [],
      }),
    ).rejects.toThrow(
      "FULCRUM_DATABASE_URL must be a postgres:// or postgresql:// connection string",
    );
  });

  test("FULCRUM_DATABASE_URL takes the same Nest TypeORM path even when local PGlite is configured", async () => {
    const moduleOptions = await createFulcrumTypeOrmModuleOptions({
      env: {
        FULCRUM_HOME: "/tmp/fulcrum-local-home",
        FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      },
      entities: [],
      migrations: [],
    });

    expect(moduleOptions).toMatchObject({
      type: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
  });

  test("application database runtime switches only connection target while preserving entities and migrations", () => {
    const local = createDataSourceOptions([], { FULCRUM_HOME: "/tmp/fulcrum-local-home" });
    const postgres = createDataSourceOptions([], {
      FULCRUM_HOME: "/tmp/fulcrum-local-home",
      DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
    const status = resolveApplicationDatabaseRuntime({
      FULCRUM_HOME: "/tmp/fulcrum-local-home",
      DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });

    expect(local.type).toBe("postgres");
    expect(postgres.type).toBe("postgres");
    expect(local.entities).toEqual(postgres.entities);
    expect(local.migrations).toEqual(postgres.migrations);
    expect(postgres).toMatchObject({
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      synchronize: false,
    });
    expect(status).toMatchObject({
      backend: "postgres",
      source: "database-url",
      target: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    });
    expect(status.entityCount).toBeGreaterThan(0);
    expect(status.migrationCount).toBeGreaterThan(0);
  });

  test("Nest root module auto-loads feature entities from bounded service modules", async () => {
    const moduleOptions = await createFulcrumTypeOrmModuleOptions({
      env: {
        FULCRUM_TYPEORM_PGLITE_SOCKET_URL:
          "postgresql://fulcrum:fulcrum@127.0.0.1:6543/fulcrum_test",
      },
    });

    expect(moduleOptions).toMatchObject({
      type: "postgres",
      autoLoadEntities: true,
    });
  });

  test("exports a TypeORM DataSource for CLI and migration tests", () => {
    const options = buildFulcrumTypeOrmOptions({
      source: "postgres",
      url: "postgres://fulcrum:fulcrum@localhost:5432/fulcrum",
      entities: [],
      migrations: [],
    });
    const dataSource = createFulcrumTypeOrmDataSource(options);

    expect(dataSource).toBeInstanceOf(DataSource);
    expect(dataSource.isInitialized).toBe(false);
    expect(dataSource.options).toMatchObject({
      type: "postgres",
      migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
      synchronize: false,
      migrationsRun: false,
    });
  });
});
