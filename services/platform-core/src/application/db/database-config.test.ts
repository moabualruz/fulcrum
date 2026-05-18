import { describe, expect, test } from "bun:test";

import { resolveDatabaseConfig } from "./database-config.ts";

describe("database configuration resolver", () => {
  test("defaults to local PGlite under Fulcrum home when no database URL exists", () => {
    expect(resolveDatabaseConfig({
      env: { FULCRUM_HOME: "/tmp/fulcrum-home" },
      config: {},
    })).toEqual({
      backend: "pglite",
      dataDir: "/tmp/fulcrum-home/pglite.data",
    });
  });

  test("switches to normal PostgreSQL from FULCRUM_DATABASE_URL without code changes", () => {
    expect(resolveDatabaseConfig({
      env: {
        FULCRUM_HOME: "/tmp/fulcrum-home",
        FULCRUM_DATABASE_URL: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
      },
      config: {
        db: {
          backend: "pglite",
          dataDir: "/tmp/fulcrum-home/pglite.data",
        },
      },
    })).toEqual({
      backend: "postgres",
      url: "postgresql://fulcrum:fulcrum@db:5432/fulcrum",
    });
  });

  test("uses DATABASE_URL as the PostgreSQL switch when the Fulcrum-specific URL is absent", () => {
    expect(resolveDatabaseConfig({
      env: { DATABASE_URL: "postgres://fulcrum:fulcrum@db:5432/fulcrum" },
      config: {},
    })).toEqual({
      backend: "postgres",
      url: "postgres://fulcrum:fulcrum@db:5432/fulcrum",
    });
  });

  test("ignores socket-only TypeORM mode for product DB status and keeps local PGlite default", () => {
    expect(resolveDatabaseConfig({
      env: {
        FULCRUM_HOME: "/tmp/fulcrum-home",
        FULCRUM_TYPEORM_PGLITE_SOCKET_URL: "postgresql://postgres:postgres@127.0.0.1:6543/postgres",
      },
      config: {},
    })).toEqual({
      backend: "pglite",
      dataDir: "/tmp/fulcrum-home/pglite.data",
    });
  });

  test("rejects every configured non-PostgreSQL URL before local fallback", () => {
    expect(() =>
      resolveDatabaseConfig({
        env: { FULCRUM_DATABASE_URL: "mysql://fulcrum:fulcrum@db:3306/fulcrum" },
        config: {},
      }),
    ).toThrow("FULCRUM_DATABASE_URL must be a postgres:// or postgresql:// connection string");

    expect(() =>
      resolveDatabaseConfig({
        env: {},
        config: { db: { backend: "postgres", url: "sqlite:///tmp/fulcrum.sqlite" } },
      }),
    ).toThrow("persisted db.url must be a postgres:// or postgresql:// connection string");

    expect(() =>
      resolveDatabaseConfig({
        env: {},
        cli: { backend: "postgres", url: "mysql://fulcrum:fulcrum@db:3306/fulcrum" },
      }),
    ).toThrow("db.url must be a postgres:// or postgresql:// connection string");
  });
});
