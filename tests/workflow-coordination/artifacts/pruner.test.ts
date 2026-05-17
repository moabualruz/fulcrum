import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ARTIFACT_PRUNE_TASK,
  pruneArtifacts,
  registerPrunerCron,
  type ArtifactPrunePayload,
} from "@workflow-coordination/infrastructure/artifacts/pruner.ts";
import type { StorageBackend } from "@workflow-coordination/infrastructure/artifacts/storage.ts";

describe("pruneArtifacts", () => {
  it("soft-archives expired artifacts and deletes their files", async () => {
    const artifactRepository = new FakeArtifactRepository([
      artifact({ id: "a1", path: "acme/run/out.txt", retentionUntil: new Date("2026-05-01T00:00:00.000Z"), sizeBytes: 12n }),
    ]);
    const storageBackend = new FakeStorageBackend();
    const eventRepository = new FakeEventRepository();

    const result = await pruneArtifacts({
      now: new Date("2026-05-03T00:00:00.000Z"),
      deps: { artifactRepository, storageBackend, eventRepository },
      confirm: true,
    });

    expect(result).toEqual({
      dryRun: false,
      softDeleted: 1,
      hardDeleted: 0,
      bytesFreed: 12n,
      candidates: [artifactRepository.rows[0]!],
      hardDeleteCandidates: [],
      skipped: [],
      confirmationRequired: false,
    });
    expect(storageBackend.deleted).toEqual(["acme/run/out.txt"]);
    expect(artifactRepository.rows[0]?.archived).toBe(true);
    expect(artifactRepository.rows[0]?.archivedAt).toEqual(new Date("2026-05-03T00:00:00.000Z"));
    expect(eventRepository.pruned).toEqual([{ count: 1, bytesFreed: 12n }]);
  });

  it("writes dry-run candidates without mutating artifacts or files", async () => {
    const logDir = join(import.meta.dir, "..", "..", ".tmp-pruner-test");
    await mkdir(logDir, { recursive: true });
    const artifactRepository = new FakeArtifactRepository([
      artifact({ id: "a1", path: "acme/run/out.txt", retentionUntil: new Date("2026-05-01T00:00:00.000Z") }),
    ]);
    const storageBackend = new FakeStorageBackend();

    const result = await pruneArtifacts({
      now: new Date("2026-05-03T00:00:00.000Z"),
      dryRun: true,
      logDir,
      deps: { artifactRepository, storageBackend },
    });

    expect(result.dryRun).toBe(true);
    expect(result.softDeleted).toBe(0);
    expect(storageBackend.deleted).toEqual([]);
    expect(artifactRepository.rows[0]?.archived).toBe(false);
    const log = await readFile(join(logDir, "prune-2026-05-03.log"), "utf8");
    expect(log).toContain("a1");
    expect(log).toContain("acme/run/out.txt");
  });

  it("hard-deletes rows archived more than seven days ago", async () => {
    const artifactRepository = new FakeArtifactRepository([
      artifact({ id: "old", archived: true, archivedAt: new Date("2026-04-24T23:59:59.000Z") }),
      artifact({ id: "recent", archived: true, archivedAt: new Date("2026-04-27T00:00:01.000Z") }),
    ]);

    const result = await pruneArtifacts({
      now: new Date("2026-05-03T00:00:00.000Z"),
      deps: {
        artifactRepository,
        storageBackend: new FakeStorageBackend(),
      },
    });

    expect(result.hardDeleted).toBe(1);
    expect(artifactRepository.deletedIds).toEqual(["old"]);
    expect(artifactRepository.rows.map((row) => row.id)).toEqual(["recent"]);
  });

  it("requires confirmation above size or count thresholds", async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      artifact({ id: `a${index}`, path: `a${index}.txt`, sizeBytes: 1n, retentionUntil: new Date("2026-05-01T00:00:00.000Z") }),
    );
    const artifactRepository = new FakeArtifactRepository(rows);
    const storageBackend = new FakeStorageBackend();

    const result = await pruneArtifacts({
      now: new Date("2026-05-03T00:00:00.000Z"),
      deps: { artifactRepository, storageBackend },
    });

    expect(result.confirmationRequired).toBe(true);
    expect(result.softDeleted).toBe(0);
    expect(storageBackend.deleted).toEqual([]);
    expect(artifactRepository.rows.every((row) => row.archived === false)).toBe(true);
  });
});

describe("registerPrunerCron", () => {
  it("registers artifact.prune at 02:00 and runs the pruner", async () => {
    const worker = new FakeCronWorker();
    const calls: ArtifactPrunePayload[] = [];

    registerPrunerCron(worker, {
      pruneArtifacts: async (payload) => {
        calls.push(payload);
        return emptyResult();
      },
    });

    expect(worker.schedules).toEqual([{ name: ARTIFACT_PRUNE_TASK, cron: "0 2 * * *" }]);
    await worker.run(ARTIFACT_PRUNE_TASK, { dryRun: true, confirm: false });
    expect(calls).toEqual([{ dryRun: true, confirm: false }]);
  });
});

interface TestArtifact {
  id: string;
  path: string;
  sizeBytes: bigint;
  retentionUntil?: Date;
  archived: boolean;
  archivedAt?: Date;
}

function artifact(input: Partial<TestArtifact> = {}): TestArtifact {
  return {
    id: input.id ?? "artifact_01",
    path: input.path ?? "artifact.txt",
    sizeBytes: input.sizeBytes ?? 10n,
    retentionUntil: input.retentionUntil,
    archived: input.archived ?? false,
    archivedAt: input.archivedAt,
  };
}

class FakeArtifactRepository {
  deletedIds: string[] = [];

  constructor(readonly rows: TestArtifact[]) {}

  async findExpiredForPrune(input: { now: Date }) {
    return this.rows.filter((row) => !row.archived && row.retentionUntil && row.retentionUntil < input.now);
  }

  async findArchivedForHardDelete(input: { before: Date }) {
    return this.rows.filter((row) => row.archived && row.archivedAt && row.archivedAt < input.before);
  }

  async markArchived(input: { id: string; archivedAt: Date }) {
    const row = this.rows.find((artifactRow) => artifactRow.id === input.id);
    if (!row) throw new Error(`Missing artifact: ${input.id}`);
    row.archived = true;
    row.archivedAt = input.archivedAt;
  }

  async hardDelete(input: { id: string }) {
    this.deletedIds.push(input.id);
    const index = this.rows.findIndex((row) => row.id === input.id);
    if (index >= 0) this.rows.splice(index, 1);
  }
}

class FakeStorageBackend implements StorageBackend {
  deleted: string[] = [];

  async put(): Promise<never> {
    throw new Error("not implemented");
  }

  async get(): Promise<never> {
    throw new Error("not implemented");
  }

  async delete(relativePath: string): Promise<void> {
    this.deleted.push(relativePath);
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

class FakeEventRepository {
  pruned: Array<{ count: number; bytesFreed: bigint }> = [];

  async recordArtifactPruned(input: { count: number; bytesFreed: bigint }) {
    this.pruned.push(input);
  }
}

class FakeCronWorker {
  schedules: Array<{ name: string; cron: string }> = [];
  private readonly tasks = new Map<string, (payload: ArtifactPrunePayload) => Promise<void>>();

  addTask(name: string, handler: (payload: ArtifactPrunePayload) => Promise<void>) {
    this.tasks.set(name, handler);
  }

  addCronTask(name: string, cron: string) {
    this.schedules.push({ name, cron });
  }

  async run(name: string, payload: ArtifactPrunePayload) {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`Missing task: ${name}`);
    await task(payload);
  }
}

function emptyResult() {
  return {
    dryRun: false,
    softDeleted: 0,
    hardDeleted: 0,
    bytesFreed: 0n,
    candidates: [],
    hardDeleteCandidates: [],
    skipped: [],
    confirmationRequired: false,
  };
}
