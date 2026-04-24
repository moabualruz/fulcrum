import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDatabase, ProjectRepository, ReadinessRepository } from "@fulcrum/db";
import { FileWorkRepository, emptyWorkState } from "@fulcrum/core";
import { createLocalStateFixture, type LocalStateFixture } from "../helpers/local-state.js";
import { createMigration, project, task } from "../helpers/sqlite-canonical.js";

describe("JSON state migration rollback boundary", () => {
  let fixture: LocalStateFixture | undefined;

  afterEach(() => fixture?.cleanup());

  it("backs up JSON mirror and records checksum during import", () => {
    fixture = createLocalStateFixture("fulcrum-json-import-");
    const db = openDatabase(fixture.dbPath);
    migrate(db, join(process.cwd(), "packages/db/migrations"));
    const readiness = new ReadinessRepository(db);
    const mirror = new FileWorkRepository(join(fixture.root, "work-state.json"));
    mirror.write({
      ...emptyWorkState(),
      projects: [project()],
      tasks: [task()]
    });

    const result = createMigration(db, readiness).migrateFromJsonMirror(mirror);
    const records = readiness.listMigrationRecords();

    expect(result.migrated).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceKind: "JSON work-state",
      sourcePath: mirror.filePath(),
      status: "imported",
      entityCounts: expect.objectContaining({
        projects: 1,
        tasks: 1
      })
    });
    expect(records[0]?.backupPath).toBeDefined();
    expect(records[0]?.backupPath && existsSync(records[0].backupPath)).toBe(true);
    expect(records[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    db.close();
  });

  it("keeps existing SQLite canonical records when stale JSON mirror disagrees", () => {
    fixture = createLocalStateFixture("fulcrum-json-migration-");
    const db = openDatabase(fixture.dbPath);
    migrate(db, join(process.cwd(), "packages/db/migrations"));
    new ProjectRepository(db).save(project({ name: "Canonical SQLite" }));
    const mirror = new FileWorkRepository(join(fixture.root, "work-state.json"));
    mirror.write({
      ...emptyWorkState(),
      projects: [project({ name: "Stale JSON" })],
      tasks: [task()]
    });

    const result = createMigration(db).migrateFromJsonMirror(mirror);

    expect(result.migrated).toBe(false);
    expect(new ProjectRepository(db).get("proj_sqlite")?.name).toBe("Canonical SQLite");
    db.close();
  });
});
