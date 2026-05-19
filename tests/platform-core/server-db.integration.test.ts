import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MigrationInterface, QueryRunner } from "typeorm";

import {
  __resetDatabaseForTest,
  closeDatabase,
  getDatabase,
  getDefaultOrgId,
  getE2eFixtureContext,
  initDatabase,
  openDatabase,
} from "../../apps/web/src/lib/server/db.ts";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME } from "@platform-core/infrastructure/application-database/seed.ts";
import { applicationMigrations, __resetDataSourceForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

let previousHome: string | undefined;

afterEach(async () => {
  await closeDatabase();
  __resetDatabaseForTest();
  await __resetDataSourceForTest();
  if (previousHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = previousHome;
});

async function useTempHome(): Promise<string> {
  previousHome = process.env.FULCRUM_HOME;
  const home = await mkdtemp(join(tmpdir(), "fulcrum-web-db-"));
  process.env.FULCRUM_HOME = home;
  return home;
}

describe("web server database singleton with real PGlite state", () => {
  test("initDatabase migrates, seeds default org, supports query/exec, and reuses singleton", async () => {
    await useTempHome();

    expect(() => getDatabase()).toThrow("Web database not initialised");
    const db = await initDatabase();
    const again = await initDatabase();
    const fixture = await getE2eFixtureContext();

    expect(again).toBe(db);
    expect(fixture.db).toBe(db);
    expect(fixture.orgId).toBe(DEFAULT_ORG_ID);

    const orgRows = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM orgs WHERE id = $1",
      [DEFAULT_ORG_ID],
    );
    expect(orgRows).toEqual([{ id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME }]);

    await db.exec("CREATE TEMP TABLE web_db_probe (id text primary key)");
    await db.query("INSERT INTO web_db_probe (id) VALUES ($1)", ["probe"]);
    expect(await db.query<{ id: string }>("SELECT id FROM web_db_probe")).toEqual([{ id: "probe" }]);
  });

  test("openDatabase close resets temp singleton, and getDefaultOrgId falls back by slug", async () => {
    await useTempHome();

    const db = await openDatabase();
    expect(await getDefaultOrgId(db)).toBe(DEFAULT_ORG_ID);
    expect(
      await getDefaultOrgId({
        query: async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
          if (sql.includes("WHERE id")) return [] as T[];
          return [{ id: "slug-default" }] as T[];
        },
      }),
    ).toBe("slug-default");
    await expect(getDefaultOrgId({ query: async () => [] })).rejects.toThrow("default org not found");

    await db.close();
    expect(() => getDatabase()).toThrow("Web database not initialised");
  });

  test("changing FULCRUM_HOME resets the existing singleton instead of leaking state", async () => {
    const firstHome = await useTempHome();
    const first = await initDatabase();
    await first.query("CREATE TABLE singleton_marker (id text primary key)");

    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-web-db-"));
    const second = await initDatabase();

    expect(process.env.FULCRUM_HOME).not.toBe(firstHome);
    expect(second).not.toBe(first);
    await expect(second.query("SELECT id FROM singleton_marker")).rejects.toThrow();
  });

  test("warm start keeps data, applies pending migrations, and completes under two seconds", async () => {
    await useTempHome();

    const cold = await initDatabase();
    const warmProjectId = "00000000-0000-0000-0000-00000000a001";
    await cold.query("INSERT INTO projects (id, org_id, name) VALUES ($1, $2, $3)", [
      warmProjectId,
      DEFAULT_ORG_ID,
      "Warm Project",
    ]);
    await closeDatabase();
    __resetDatabaseForTest();
    __resetDataSourceForTest();

    class WarmStartProbe9999999999999 implements MigrationInterface {
      name = "WarmStartProbe9999999999999";

      async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE IF NOT EXISTS warm_start_probe (id text PRIMARY KEY)");
      }

      async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TABLE IF EXISTS warm_start_probe");
      }
    }

    applicationMigrations.push(WarmStartProbe9999999999999);
    try {
      const startedAt = performance.now();
      const warm = await initDatabase();
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeLessThan(2_000);
      expect(await warm.query<{ id: string }>("SELECT id FROM projects WHERE id = $1", [warmProjectId])).toEqual([
        { id: warmProjectId },
      ]);
      expect(await warm.query<{ id: string }>("SELECT id FROM warm_start_probe")).toEqual([]);
    } finally {
      applicationMigrations.pop();
    }
  }, 10_000);
});
