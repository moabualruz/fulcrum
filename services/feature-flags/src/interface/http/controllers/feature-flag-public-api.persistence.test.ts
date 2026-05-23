import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { PLATFORM_FEATURE_FLAG_ENTITIES } from "@feature-flags/infrastructure/database/entities/feature-flag.entities.ts";
import { PlatformFeatureFlags1778753400000 } from "@feature-flags/infrastructure/database/migrations/feature-flag.migration.ts";
import { FeatureFlagStore } from "@feature-flags/infrastructure/database/repositories/feature-flag-store.ts";
import {
  FeatureFlagPublicApiController,
  FeatureFlagPublicApiService,
} from "@feature-flags/interface/http/controllers/feature-flag-public-api.controller.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertFeatureFlagRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: PLATFORM_FEATURE_FLAG_ENTITIES,
      migrations: [PlatformFeatureFlags1778753400000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "PlatformFeatureFlags1778753400000",
    ]);

    const controller = new FeatureFlagPublicApiController(
      new FeatureFlagPublicApiService(
        { featuresEnv: "public-api,experiments" },
        new FeatureFlagStore(dataSource),
      ),
    );
    await expect(controller.list({ orgId: ORG_ID, userId: USER_ID })).resolves.toContainEqual(
      expect.objectContaining({
        flag: "experiments",
        enabled: true,
        rolloutPercent: 100,
        source: "env",
      }),
    );
    await expect(controller.set({
      flag: "public-api",
      orgId: ORG_ID,
      userId: USER_ID,
      enabled: true,
    })).resolves.toEqual(expect.objectContaining({
      flag: "public-api",
      enabled: true,
      rolloutPercent: 100,
      source: "user",
    }));
    await expect(controller.evaluate({
      flag: "public-api",
      orgId: ORG_ID,
      userId: USER_ID,
    })).resolves.toEqual({
      flag: "public-api",
      enabled: true,
      rolloutPercent: 100,
      source: "user",
    });
    await expect(controller.setOverride({
      flag: "experiments",
      orgId: ORG_ID,
      enabled: false,
    })).resolves.toEqual(expect.objectContaining({
      flag: "experiments",
      enabled: false,
      rolloutPercent: 0,
      source: "org",
    }));
    await expect(controller.evaluate({
      flag: "experiments",
      orgId: ORG_ID,
      userId: "other-user",
    })).resolves.toEqual({
      flag: "experiments",
      enabled: false,
      rolloutPercent: 0,
      source: "org",
    });
    await expect(controller.setRollout({
      flag: "router-llm",
      orgId: ORG_ID,
      rolloutPercent: 25,
    })).resolves.toEqual(expect.objectContaining({
      flag: "router-llm",
      enabled: true,
      rolloutPercent: 25,
      source: "org",
    }));
  } finally {
    await dataSource.destroy();
  }
}

describe("feature flag public API TypeORM persistence", () => {
  test("persists feature flag controls through PGlite socket", async () => {
    await assertFeatureFlagRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists feature flag controls through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertFeatureFlagRoundTrip("postgres", postgres.url);
  });
});
