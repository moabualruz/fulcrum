import { describe, expect, test } from "vitest";

import { getServerTestDataSource } from "./setup.ts";

describe("server Vitest PGlite setup", () => {
  test("runs against an isolated TypeORM PGlite DataSource", async () => {
    const dataSource = getServerTestDataSource();

    await dataSource.query("CREATE TABLE IF NOT EXISTS vitest_smoke (id text PRIMARY KEY)");
    await dataSource.query("INSERT INTO vitest_smoke (id) VALUES ($1)", ["smoke-1"]);

    const rows = await dataSource.query("SELECT id FROM vitest_smoke");

    expect(rows).toEqual([{ id: "smoke-1" }]);
  });
});
