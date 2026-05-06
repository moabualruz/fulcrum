import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Credential } from "../../src/db/entities/platform/Credential.ts";
import { User } from "../../src/db/entities/auth/User.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { TaskRepository } from "../../src/db/repositories/tasks/TaskRepository.ts";
import { createTestOrm } from "../../src/test-utils/db.ts";
import { createContext } from "../../src/trpc/context.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession() {
  return {
    id: "sess-json-import-export",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-json-import-export",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(repo: TaskRepository) {
  const container = new Container();
  container.bind({ provide: TaskRepository, useValue: repo });

  return createCaller(
    createContext({
      session: mockSession() as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em: repo.getEntityManager() as unknown as import("@mikro-orm/postgresql").EntityManager,
      container,
    }),
  );
}

async function writeManifest(json: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-json-import-"));
  const path = join(dir, "org.json");
  await writeFile(path, json, "utf8");
  return path;
}

describe("JSON import/export tRPC procedures", () => {
  test("dataExport.create returns manifest JSON with entity counts and redacted credentials", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = em.getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const task = await caller.tasks.create({ title: "Export me", status: "ready" });
      em.create(User, {
        id: USER_ID,
        orgId: ORG_ID,
        email: "json-import-export@example.com",
        role: "owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.flush();
      await em.getConnection().execute(
        `
          insert into credentials (id, org_id, user_id, name, encrypted_value, algo, kdf, provider, archived)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "00000000-0000-4000-8000-000000000099",
          ORG_ID,
          USER_ID,
          "openai",
          Buffer.from("plaintext-secret"),
          "nacl-secretbox",
          "argon2id",
          "local",
          false,
        ],
      );

      const result = await caller.dataExport.create({ pretty: true });
      const manifest = JSON.parse(result.json);

      expect(result).toMatchObject({ ok: true, format: "fulcrum.json-export.v1" });
      expect(manifest.manifest.schema_version).toBe(1);
      expect(manifest.manifest.fulcrum_version).toEqual(expect.any(String));
      expect(manifest.manifest.exported_at).toEqual(expect.any(String));
      expect(manifest.manifest.counts.tasks).toBe(1);
      expect(manifest.tasks.map((row: { id: string }) => row.id)).toEqual([task.id]);
      expect(result.json).not.toContain("plaintext-secret");
      expect(manifest.credentials[0]).not.toHaveProperty("encrypted_value");
      expect(manifest.credentials[0]).not.toHaveProperty("token");
      expect(manifest.credentials[0]).not.toHaveProperty("secret");
      expect(manifest.credentials[0]).not.toHaveProperty("password");
      expect(manifest.credentials[0]).toMatchObject({
        id: "00000000-0000-4000-8000-000000000099",
        name: "openai",
        redacted: true,
      });
    } finally {
      await db.close();
    }
  });

  test("dataImport.preflight reports counts and UUID collisions", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const task = await caller.tasks.create({ title: "Existing" });
      const exportResult = await caller.dataExport.create();
      const path = await writeManifest(exportResult.json);

      const preflight = await caller.dataImport.preflight({ path });

      expect(preflight).toMatchObject({
        ok: true,
        importId: path,
        counts: expect.objectContaining({ tasks: 1 }),
      });
      expect(preflight.collisions).toContainEqual({ kind: "tasks", id: task.id });
    } finally {
      await db.close();
    }
  });

  test("dataImport.run supports dry-run, update idempotence, and error collisions", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const created = await caller.tasks.create({ title: "Before import", status: "todo" });
      const exported = JSON.parse((await caller.dataExport.create()).json);
      exported.tasks[0].title = "After import";
      exported.tasks[0].status = "ready";
      const path = await writeManifest(JSON.stringify(exported));

      const dryRun = await caller.dataImport.run({
        importId: path,
        dryRun: true,
        onConflict: "update",
      });
      expect(dryRun).toMatchObject({ ok: true, imported: 0, updated: 0, skipped: 0, errors: 0 });
      expect(await caller.tasks.list()).toHaveLength(1);
      expect((await caller.tasks.get({ id: created.id }))?.title).toBe("Before import");

      const firstRun = await caller.dataImport.run({ importId: path, onConflict: "update" });
      expect(firstRun).toMatchObject({ ok: true, errors: 0 });
      expect(firstRun.updated).toBeGreaterThanOrEqual(1);
      expect(await caller.tasks.get({ id: created.id })).toMatchObject({
        title: "After import",
        status: "ready",
      });

      const secondRun = await caller.dataImport.run({ importId: path, onConflict: "update" });
      expect(secondRun).toMatchObject({ ok: true, errors: 0 });
      expect(secondRun).toMatchObject({
        imported: firstRun.imported,
        updated: firstRun.updated,
        skipped: firstRun.skipped,
      });

      await expect(caller.dataImport.run({ importId: path, onConflict: "error" })).rejects
        .toMatchObject({ code: "CONFLICT" });
    } finally {
      await db.close();
    }
  });
});
