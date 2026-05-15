import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDbCommand } from "./db.ts";

const originalFulcrumHome = process.env["FULCRUM_HOME"];
const originalDatabaseUrl = process.env["DATABASE_URL"];
const originalFulcrumDatabaseUrl = process.env["FULCRUM_DATABASE_URL"];
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_HOME", originalFulcrumHome);
  restoreEnv("DATABASE_URL", originalDatabaseUrl);
  restoreEnv("FULCRUM_DATABASE_URL", originalFulcrumDatabaseUrl);
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated database commands", () => {
  test("ping reports the selected local PGlite backend without tRPC", async () => {
    delete process.env["DATABASE_URL"];
    delete process.env["FULCRUM_DATABASE_URL"];
    process.env["FULCRUM_HOME"] = await mkdtemp(join(tmpdir(), "fulcrum-generated-db-"));
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createDbCommand().parseAsync(["ping", "--json"], { from: "user" });

    expect(JSON.parse(output.join("\n"))).toEqual({
      backend: "pglite",
      connection: {
        type: "local-pglite",
        dataDir: `${process.env["FULCRUM_HOME"]}/pglite.data`,
      },
      current: null,
      pending: [],
      pastDue: 0,
      ok: true,
    });
  });

  test("ping switches to PostgreSQL from FULCRUM_DATABASE_URL without tRPC", async () => {
    delete process.env["DATABASE_URL"];
    process.env["FULCRUM_DATABASE_URL"] = "postgresql://fulcrum:secret@127.0.0.1:5432/fulcrum";
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createDbCommand().parseAsync(["ping", "--json"], { from: "user" });

    expect(JSON.parse(output.join("\n"))).toEqual({
      backend: "postgres",
      connection: {
        type: "postgres",
        url: "postgresql://fulcrum:***@127.0.0.1:5432/fulcrum",
      },
      current: null,
      pending: [],
      pastDue: 0,
      ok: true,
    });
  });

  test("ping switches to PostgreSQL from DATABASE_URL when Fulcrum-specific URL is absent", async () => {
    delete process.env["FULCRUM_DATABASE_URL"];
    process.env["DATABASE_URL"] = "postgres://fulcrum:secret@127.0.0.1:5432/fulcrum";
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createDbCommand().parseAsync(["ping", "--json"], { from: "user" });

    expect(JSON.parse(output.join("\n"))).toEqual({
      backend: "postgres",
      connection: {
        type: "postgres",
        url: "postgres://fulcrum:***@127.0.0.1:5432/fulcrum",
      },
      current: null,
      pending: [],
      pastDue: 0,
      ok: true,
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
