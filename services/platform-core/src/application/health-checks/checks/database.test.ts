import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checks } from "./database.ts";

const originalFulcrumHome = process.env.FULCRUM_HOME;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalFulcrumDatabaseUrl = process.env.FULCRUM_DATABASE_URL;

afterEach(() => {
  if (originalFulcrumHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = originalFulcrumHome;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalFulcrumDatabaseUrl === undefined) delete process.env.FULCRUM_DATABASE_URL;
  else process.env.FULCRUM_DATABASE_URL = originalFulcrumDatabaseUrl;
});

describe("database doctor check", () => {
  test("reports the managed local PGlite path when no database URL is configured", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-database-doctor-"));
    process.env.FULCRUM_HOME = home;
    delete process.env.DATABASE_URL;
    delete process.env.FULCRUM_DATABASE_URL;

    const result = await checks[0]!.run();

    expect(result).toMatchObject({
      status: "warn",
      message: `local PGlite database not initialised at ${join(home, "db", "main")}`,
    });
  });

  test("reports PostgreSQL selection without leaking credentials", async () => {
    process.env.FULCRUM_DATABASE_URL = "postgresql://fulcrum:secret@127.0.0.1:9/fulcrum";

    const result = await checks[0]!.run();

    expect(result.status).toBe("fail");
    expect(result.message).toContain("postgres database unavailable at postgresql://fulcrum:***@127.0.0.1:9/fulcrum");
    expect(result.message).not.toContain("secret");
  });
});
