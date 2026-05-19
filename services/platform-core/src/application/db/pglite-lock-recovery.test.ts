import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertPgliteLockRecoverable,
  recoverStalePgliteLock,
} from "./pglite-lock-recovery.ts";
import { openLocalSqlStore } from "@platform-core/infrastructure/application-database/sql.ts";

describe("PGlite lock recovery", () => {
  test("removes stale postmaster.pid before opening local store", async () => {
    const dataDir = join(await mkdtemp(join(tmpdir(), "fulcrum-pglite-lock-")), "db");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "postmaster.pid"), "999999\n/old/db\n");

    const recovered = await recoverStalePgliteLock(dataDir);
    expect(recovered.status).toBe("stale-removed");
    expect(recovered.pid).toBe(999999);

    const db = await openLocalSqlStore(dataDir);
    try {
      expect((await db.query<{ ok: number }>("SELECT 1::int AS ok"))[0]?.ok).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("does not remove lock held by the current live process", async () => {
    const dataDir = join(await mkdtemp(join(tmpdir(), "fulcrum-pglite-live-lock-")), "db");
    const lockPath = join(dataDir, "postmaster.pid");
    await mkdir(dataDir, { recursive: true });
    await writeFile(lockPath, `${process.pid}\n/live/db\n`);

    await expect(assertPgliteLockRecoverable(dataDir)).rejects.toThrow("PGlite lock is held by live process");
    expect(await readFile(lockPath, "utf8")).toContain(String(process.pid));
  });
});
