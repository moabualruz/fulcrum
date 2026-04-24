import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidationService } from "@fulcrum/core";
import { migrate, openDatabase, ReadinessRepository } from "@fulcrum/db";

describe("invalidation records contract", () => {
  it("persists generated and stale invalidation records in SQLite", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-invalidation-contract-"));
    const db = openDatabase(path.join(root, "state.db"));
    migrate(db, path.resolve("packages/db/migrations"));
    const repository = new ReadinessRepository(db);
    const service = new InvalidationService(repository);

    const generated = service.recordGenerated({
      derivedKind: "repo_pack",
      rebuildSource: "repo-pack:proj_01",
      sourceRefs: [{ type: "file", uri: "src/index.ts" }],
      repoHead: "abc123",
      workingTreeSignature: "sig-a",
      ignoreConfigHash: "ignore-a",
      toolVersion: "repomix@1"
    });

    service.markStale(generated.recordId, "File changed.", "2026-04-24T00:00:00.000Z");
    service.recordGenerated({
      recordId: generated.recordId,
      derivedKind: "repo_pack",
      rebuildSource: "repo-pack:proj_01",
      sourceRefs: [{ type: "file", uri: "src/index.ts" }],
      repoHead: "abc123",
      workingTreeSignature: "sig-a",
      ignoreConfigHash: "ignore-a",
      toolVersion: "repomix@1",
      generatedAt: "2026-04-24T01:00:00.000Z"
    });

    const stored = repository.getInvalidationRecord(generated.recordId);
    expect(stored?.derivedKind).toBe("repo_pack");
    expect(stored?.sourceRefs[0]?.uri).toBe("src/index.ts");
    expect(stored?.generatedAt).toBe("2026-04-24T01:00:00.000Z");
    expect(stored?.staleReason).toBeUndefined();
    expect(service.status("repo_pack")).toMatchObject({ total: 1, fresh: 1, stale: 0 });
  });
});
