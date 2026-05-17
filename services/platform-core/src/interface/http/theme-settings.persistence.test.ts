import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_THEME_SETTING_ENTITIES,
  FulcrumThemeSettingEntity,
} from "@platform-core/infrastructure/database/theme-settings.entities.ts";
import { ThemeSettings1778759000000 } from "@platform-core/infrastructure/database/theme-settings.migration.ts";
import { ThemeSettingsStore } from "@platform-core/infrastructure/database/theme-settings-store.ts";
import {
  ThemeSettingsApiController,
  ThemeSettingsApiService,
} from "@platform-core/interface/http/theme-settings.controller.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

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

async function assertThemeRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: FULCRUM_THEME_SETTING_ENTITIES,
      migrations: [ThemeSettings1778759000000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual(["ThemeSettings1778759000000"]);

    const controller = new ThemeSettingsApiController(
      new ThemeSettingsApiService(
        { featuresEnv: "public-api" },
        new ThemeSettingsStore(dataSource),
      ),
    );

    await expect(controller.getProfile({ orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      accentHue: 262,
      preset: "default",
    });
    await expect(controller.updateProfile({
      orgId: ORG_ID,
      userId: USER_ID,
      accentHue: 210,
      accentSaturation: 90,
      accentLightness: 50,
      radius: 0.75,
      fontFamily: "system",
      colorScheme: "dark",
      compactMode: true,
      animationSpeed: "reduced",
      preset: "ocean",
    })).resolves.toMatchObject({
      accentHue: 210,
      colorScheme: "dark",
      preset: "ocean",
    });
    await expect(controller.getProfile({ orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      accentHue: 210,
      colorScheme: "dark",
      compactMode: true,
      preset: "ocean",
    });
    await expect(controller.setToken(
      { key: "accent" },
      { orgId: ORG_ID, userId: USER_ID, value: "#2563EB" },
    )).resolves.toEqual({
      key: "theme.accent",
      value: "#2563EB",
      defaultValue: "#6D28D9",
    });
    await expect(controller.getToken({ key: "accent" }, { orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({
      key: "theme.accent",
      value: "#2563EB",
      defaultValue: "#6D28D9",
    });
    await expect(controller.listTokens({ orgId: ORG_ID, userId: USER_ID })).resolves.toContainEqual({
      key: "theme.accent",
      value: "#2563EB",
      defaultValue: "#6D28D9",
    });
    await expect(dataSource.getRepository(FulcrumThemeSettingEntity).count()).resolves.toBeGreaterThanOrEqual(10);
  } finally {
    await dataSource.destroy();
  }
}

describe("theme settings TypeORM persistence", () => {
  test("persists theme settings through PGlite socket", async () => {
    await assertThemeRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists theme settings through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertThemeRoundTrip("postgres", postgres.url);
  });
});
