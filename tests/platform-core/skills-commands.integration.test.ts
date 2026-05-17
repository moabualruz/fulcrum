import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import {
  SkillConflict,
  SkillConflictKind,
  SkillConflictStatus,
} from "@platform-core/infrastructure/application-database/entities/skills/SkillConflict.ts";
import { overrideSkillConflict, overrideSkillLock } from "@platform-core/application/skills/commands.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm | null = null;
let previousHome: string | undefined;

afterEach(async () => {
  await db?.close();
  db = null;
  if (previousHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = previousHome;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("skill application commands with real lock file and audit persistence", () => {
  test("overrideSkillLock updates skills.lock.json and records an audit event when org exists", async () => {
    previousHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-skill-lock-"));
    const testDb = await freshDb();

    await overrideSkillLock(testDb.em, { orgId: DEFAULT_ORG_ID }, {
      slug: "truthful-tests",
      expectedSha256: "old",
      actualSha256: "new",
      auditNote: "verified by integration test",
    });

    const lock = JSON.parse(await readFile(join(process.env.FULCRUM_HOME, "skills.lock.json"), "utf8"));
    expect(lock["truthful-tests"].hash).toBe("new");

    const rows = await testDb.em.getConnection().execute<Array<{ verb: string; payload: unknown }>>(
      `SELECT verb, payload FROM events WHERE verb = ? AND subject_id = ?`,
      ["lock_override", "truthful-tests:old->new"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toMatchObject({ slug: "truthful-tests", auditNote: "verified by integration test" });
  });

  test("overrideSkillConflict marks missing and local conflicts without resolving upstream", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const conflictId = randomUUID();
    const conflict = em.create(SkillConflict, {
      id: conflictId,
      org: DEFAULT_ORG_ID,
      slug: "local-only",
      kind: SkillConflictKind.UpstreamConflict,
      status: SkillConflictStatus.Open,
      localHash: "local",
      upstreamHash: "upstream",
      baseHash: "base",
      suggestedResolution: "local",
      auditNote: null,
    } as never);
    await em.save(conflict);

    await expect(
      overrideSkillConflict(em, { orgId: DEFAULT_ORG_ID }, {
        conflictId: randomUUID(),
        auditNote: "missing",
        resolution: "local",
      }),
    ).rejects.toThrow("not found");

    await overrideSkillConflict(em, { orgId: DEFAULT_ORG_ID }, {
      conflictId,
      auditNote: "keep local implementation",
      resolution: "local",
    });

    const updated = await em.findOneOrFail(SkillConflict, { id: conflictId });
    expect(updated.status).toBe(SkillConflictStatus.Overridden);
    expect(updated.auditNote).toBe("keep local implementation");
  });
});
