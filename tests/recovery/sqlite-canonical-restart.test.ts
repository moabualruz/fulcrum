import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@fulcrum/db";
import { FileWorkRepository, emptyWorkState } from "@fulcrum/core";
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
});
