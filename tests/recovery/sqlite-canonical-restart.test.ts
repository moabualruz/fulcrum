import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@fulcrum/db";
import {
  FileWorkRepository,
  emptyWorkState,
  sqliteRuntimeRecoveryMarkerPath,
  sqliteStateStatus
} from "@fulcrum/core";
import { createLocalStateFixture, type LocalStateFixture } from "../helpers/local-state.js";
import { createMigration, project, task } from "../helpers/sqlite-canonical.js";

describe("SQLite canonical restart", () => {
  let fixture: LocalStateFixture | undefined;

  afterEach(() => fixture?.cleanup());

  it("survives JSON mirror deletion by reading canonical work state from SQLite", () => {
    fixture = createLocalStateFixture("fulcrum-sqlite-restart-");
    const db = openDatabase(fixture.dbPath);
    migrate(db, join(process.cwd(), "packages/db/migrations"));
    const migration = createMigration(db);
    const mirror = new FileWorkRepository(join(fixture.root, "work-state.json"));
    mirror.write({
      ...emptyWorkState(),
      projects: [project()],
      tasks: [task()]
    });

    expect(migration.migrateFromJsonMirror(mirror).migrated).toBe(true);
    rmSync(join(fixture.root, "work-state.json"), { force: true });

    const restarted = createMigration(db).snapshot();
    expect(restarted.projects).toHaveLength(1);
    expect(restarted.tasks).toHaveLength(1);
    expect(restarted.tasks[0]?.title).toBe("Canonical task");
    db.close();
  });

  it("marks readiness blocked after runtime recovers a corrupt SQLite database", () => {
    fixture = createLocalStateFixture("fulcrum-sqlite-corrupt-");
    writeFileSync(fixture.dbPath, "not sqlite");

    execFileSync(
      "pnpm",
      ["exec", "tsx", "-e", "(async () => { await import('./src/work-runtime.ts'); })();"],
      {
        cwd: join(process.cwd(), "apps/cli"),
        env: { ...process.env, FULCRUM_STATE_ROOT: fixture.root },
        encoding: "utf8"
      }
    );

    const status = sqliteStateStatus(fixture.dbPath);

    expect(status).toMatchObject({
      state: "blocked",
      blocking: true
    });
    expect(status.cause).toContain(".corrupt-");
    expect(existsSync(sqliteRuntimeRecoveryMarkerPath(fixture.dbPath))).toBe(true);
  });
});
