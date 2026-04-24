import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDatabase, ProjectRepository, TaskRepository } from "@fulcrum/db";
import { createLocalStateFixture, type LocalStateFixture } from "../helpers/local-state.js";
import { createMigration, project, task } from "../helpers/sqlite-canonical.js";

describe("cross-surface SQLite parity", () => {
  let fixture: LocalStateFixture | undefined;
  let foreignCwd: string | undefined;

  afterEach(() => {
    if (foreignCwd) {
      rmSync(foreignCwd, { recursive: true, force: true });
      foreignCwd = undefined;
    }
    fixture?.cleanup();
    fixture = undefined;
  });

  it("shares one SQLite state across CLI, server, and TUI repository views", () => {
    fixture = createLocalStateFixture("fulcrum-sqlite-parity-");
    const db = openDatabase(fixture.dbPath);
    migrate(db, join(process.cwd(), "packages/db/migrations"));

    new ProjectRepository(db).save(project());
    new TaskRepository(db).save(task({ title: "Created through CLI" }));

    const server = createMigration(db).snapshot();
    const tui = createMigration(db).snapshot();

    expect(server.projects.map((item) => item.projectId)).toEqual(["proj_sqlite"]);
    expect(server.tasks.map((item) => item.title)).toEqual(["Created through CLI"]);
    expect(tui).toMatchObject(server);
    db.close();
  });

  it("keeps server setup, server runtime, and TUI startup independent from launch cwd", () => {
    fixture = createLocalStateFixture("fulcrum-sqlite-cwd-");
    foreignCwd = mkdtempSync(join(tmpdir(), "fulcrum-launch-cwd-"));

    runSurfaceScript("apps/cli", fixture.root, foreignCwd, [
      "const { join } = await import('node:path');",
      "const { createCliSetupPorts } = await import('./src/runtime.ts');",
      `const ports = await createCliSetupPorts(${JSON.stringify(fixture.root)});`,
      `await ports.initializeDatabase(join(${JSON.stringify(fixture.root)}, 'fulcrum.sqlite'));`
    ]);

    runSurfaceScript("apps/cli", fixture.root, foreignCwd, ["await import('./src/work-runtime.ts');"]);

    runSurfaceScript("apps/server", fixture.root, foreignCwd, [
      "const { join } = await import('node:path');",
      "const { createServerSetupPorts } = await import('./src/runtime.ts');",
      "const ports = createServerSetupPorts();",
      `await ports.initializeDatabase(join(${JSON.stringify(fixture.root)}, 'fulcrum.sqlite'));`
    ]);

    runSurfaceScript("apps/server", fixture.root, foreignCwd, [
      "await import('./src/work-runtime.ts');"
    ]);

    const output = runSurfaceScript("apps/tui", fixture.root, foreignCwd, [
      "process.argv[2] = 'dashboard';",
      "await import('./src/main.ts');"
    ]);

    expect(output).toContain("Dashboard");
  });
});

function runSurfaceScript(
  appPath: string,
  stateRoot: string,
  cwdOverride: string,
  lines: string[]
): string {
  return execFileSync("pnpm", ["exec", "tsx", "-e", buildScript(cwdOverride, lines)], {
    cwd: join(process.cwd(), appPath),
    env: { ...process.env, FULCRUM_STATE_ROOT: stateRoot },
    encoding: "utf8"
  });
}

function buildScript(cwdOverride: string, lines: string[]): string {
  return [
    "(async () => {",
    `process.chdir(${JSON.stringify(cwdOverride)});`,
    ...lines,
    "})().catch((error) => {",
    "  console.error(error instanceof Error ? error.stack ?? error.message : String(error));",
    "  process.exit(1);",
    "});"
  ].join("\n");
}
