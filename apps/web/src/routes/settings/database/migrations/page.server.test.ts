import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { actions, load } from "./+page.server.ts";

const originalFulcrumHome = process.env["FULCRUM_HOME"];
const originalDatabaseUrl = process.env["DATABASE_URL"];
const originalFulcrumDatabaseUrl = process.env["FULCRUM_DATABASE_URL"];

afterEach(() => {
  restoreEnv("FULCRUM_HOME", originalFulcrumHome);
  restoreEnv("DATABASE_URL", originalDatabaseUrl);
  restoreEnv("FULCRUM_DATABASE_URL", originalFulcrumDatabaseUrl);
});

describe("/settings/database/migrations", () => {
  test("loads local PGlite database status for the web route", async () => {
    delete process.env["DATABASE_URL"];
    delete process.env["FULCRUM_DATABASE_URL"];
    process.env["FULCRUM_HOME"] = await mkdtemp(join(tmpdir(), "fulcrum-web-db-status-"));

    const result = await load();

    expect(result).toEqual({
      database: {
        backend: "pglite",
        connection: {
          type: "local-pglite",
          dataDir: `${process.env["FULCRUM_HOME"]}/pglite.data`,
        },
      },
      status: {
        current: null,
        pending: [],
        pastDue: 0,
      },
      history: [],
    });
  });

  test("loads redacted PostgreSQL status when configured", async () => {
    delete process.env["DATABASE_URL"];
    process.env["FULCRUM_DATABASE_URL"] = "postgresql://fulcrum:secret@127.0.0.1:5432/fulcrum";

    const result = await load();

    expect(result.database).toEqual({
      backend: "postgres",
      connection: {
        type: "postgres",
        url: "postgresql://fulcrum:***@127.0.0.1:5432/fulcrum",
      },
    });
  });

  test("migration action fails explicitly until the database management API owns mutations", async () => {
    const result = await actions.migrate();

    expect(result).toMatchObject({
      status: 501,
      data: {
        ok: false,
        message: "Database migration actions are not available from the web runtime.",
      },
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
