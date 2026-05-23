import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { run } from "../commands/offline.ts";

function harness() {
  const lines: string[] = [];
  const errLines: string[] = [];
  let exitCode: number | undefined;
  return {
    lines,
    errLines,
    opts: {
      print: (line: string) => lines.push(line),
      printErr: (line: string) => errLines.push(line),
      exit: (code: number) => {
        exitCode = code;
      },
    },
    get exitCode() {
      return exitCode;
    },
  };
}

async function stateFixture(): Promise<{ dir: string; path: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-offline-cli-"));
  await mkdir(dir, { recursive: true });
  const path = join(dir, "offline-state.json");
  return {
    dir,
    path,
    env: {
      FULCRUM_OFFLINE_STATE_PATH: path,
      FULCRUM_HOME: dir,
      HOME: dir,
    } as NodeJS.ProcessEnv,
  };
}

describe("offline reconnect CLI", () => {
  test("status --json reports connection, last sync, queued changes, and sync command", async () => {
    const fixture = await stateFixture();
    await writeFile(fixture.path, JSON.stringify({
      connection: "offline",
      lastSyncAt: "2026-05-18T08:42:00.000Z",
      queuedChanges: 3,
    }));
    const h = harness();

    await run(["status", "--json"], { ...h.opts, env: fixture.env });

    expect(h.exitCode).toBeUndefined();
    expect(h.errLines).toEqual([]);
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      ok: true,
      connection: "offline",
      lastSyncAt: "2026-05-18T08:42:00.000Z",
      queuedChanges: 3,
      syncNowCommand: "fulcrum offline sync-now --json",
    });
  });

  test("sync-now --json replays queued changes and persists online status", async () => {
    const fixture = await stateFixture();
    await writeFile(fixture.path, JSON.stringify({
      connection: "offline",
      lastSyncAt: "2026-05-18T08:42:00.000Z",
      queuedChanges: 3,
    }));
    const h = harness();

    await run(["sync-now", "--json"], {
      ...h.opts,
      env: fixture.env,
      now: () => new Date("2026-05-18T09:00:00.000Z"),
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      ok: true,
      connection: "online",
      lastSyncAt: "2026-05-18T09:00:00.000Z",
      queuedChanges: 0,
      replayedChanges: 3,
    });
    expect(JSON.parse(await readFile(fixture.path, "utf8"))).toEqual({
      connection: "online",
      lastSyncAt: "2026-05-18T09:00:00.000Z",
      queuedChanges: 0,
    });
  });

  test("unknown command exits with usage error", async () => {
    const h = harness();

    await run(["bogus"], h.opts);

    expect(h.exitCode).toBe(2);
    expect(h.errLines).toEqual(["fulcrum offline: unknown command 'bogus'"]);
  });
});
