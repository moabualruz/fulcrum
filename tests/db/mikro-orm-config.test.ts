import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

import { __resetDefaultOrmForTest, initOrm } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";

describe("initOrm", () => {
  afterEach(async () => {
    await __resetDefaultOrmForTest();
  });

  test("caches the default ORM instance", async () => {
    const first = await initOrm();
    const second = await initOrm();

    expect(second).toBe(first);
  });

  test("deduplicates concurrent default ORM initialization", async () => {
    const [first, second] = await Promise.all([initOrm(), initOrm()]);

    expect(second).toBe(first);
  });

  test("caches empty-valued default options", async () => {
    const first = await initOrm({ pglite: undefined, entities: [] });
    const second = await initOrm({ pglite: undefined, entities: [] });

    expect(second).toBe(first);
  });

  test("does not cache explicitly configured debug false instances", async () => {
    const first = await initOrm();
    const second = await initOrm({ debug: false });

    try {
      expect(second).not.toBe(first);
    } finally {
      if (second !== first) await second.close(true);
    }
  });

  test("does not cache explicitly configured ORM instances", async () => {
    const first = await initOrm({ pglite: new PGlite() });
    const second = await initOrm({ pglite: new PGlite() });

    try {
      expect(second).not.toBe(first);
    } finally {
      await first.close(true);
      await second.close(true);
    }
  });
});

describe("resolveDatabaseConfig", () => {
  test("defaults to PGlite under Fulcrum home", () => {
    const config = resolveDatabaseConfig({
      env: { FULCRUM_HOME: "/tmp/fulcrum-home" },
      config: {},
    });

    expect(config.backend).toBe("pglite");
    expect(config.dataDir).toBe("/tmp/fulcrum-home/pglite.data");
  });

  test("DATABASE_URL selects PostgreSQL when no persisted backend exists", () => {
    const config = resolveDatabaseConfig({
      env: { DATABASE_URL: "postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum" },
      config: {},
    });

    expect(config.backend).toBe("postgres");
    expect(config.url).toBe("postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum");
  });

  test("FULCRUM_DATABASE_URL selects PostgreSQL without changing application code", () => {
    const config = resolveDatabaseConfig({
      env: { FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum" },
      config: {},
    });

    expect(config.backend).toBe("postgres");
    expect(config.url).toBe("postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum");
  });

  test("FULCRUM_DATABASE_URL overrides persisted local PGlite config for seamless switching", () => {
    const config = resolveDatabaseConfig({
      env: { FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum" },
      config: {
        db: {
          backend: "pglite",
          dataDir: "/tmp/fulcrum-home/pglite.data",
        },
      },
    });

    expect(config.backend).toBe("postgres");
    expect(config.url).toBe("postgresql://fulcrum:fulcrum@127.0.0.1:5432/fulcrum");
  });

  test("rejects non-PostgreSQL DATABASE_URL values instead of silently using PGlite", () => {
    expect(() =>
      resolveDatabaseConfig({
        env: { DATABASE_URL: "sqlite:///tmp/fulcrum.sqlite" },
        config: {},
      }),
    ).toThrow("DATABASE_URL must be a postgres:// or postgresql:// connection string");
  });

  test("persisted db.backend can select PostgreSQL", () => {
    const config = resolveDatabaseConfig({
      env: {},
      config: {
        db: {
          backend: "postgres",
          url: "postgres://fulcrum:fulcrum@localhost:5432/fulcrum",
        },
      },
    });

    expect(config.backend).toBe("postgres");
    expect(config.url).toBe("postgres://fulcrum:fulcrum@localhost:5432/fulcrum");
  });
});
