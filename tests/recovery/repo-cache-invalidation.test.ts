import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectRepoFingerprint,
  InvalidationService,
  MemoryInvalidationRepository
} from "@fulcrum/core";

describe("repo cache invalidation recovery", () => {
  it("marks repo-derived cache stale when working tree signature changes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-repo-cache-"));
    const file = path.join(root, "README.md");
    writeFileSync(file, "alpha\n");
    const invalidation = new InvalidationService(new MemoryInvalidationRepository());
    const initial = collectRepoFingerprint(root, "repomix@1");
    invalidation.recordGenerated({
      derivedKind: "repo_pack",
      rebuildSource: "repo-pack:proj_01",
      sourceRefs: [{ type: "file", uri: file }],
      ...initial
    });

    writeFileSync(file, "alpha\nbeta\n");
    invalidation.invalidateChanged({
      derivedKinds: ["repo_pack"],
      reason: "Repository working tree changed.",
      ...collectRepoFingerprint(root, "repomix@1")
    });

    expect(invalidation.status("repo_pack")).toMatchObject({ fresh: 0, stale: 1 });
    expect(invalidation.status("repo_pack").staleRecords[0]?.staleReason).toBe(
      "Repository working tree changed."
    );
  });

  it("marks repo-derived cache stale when ignore config is removed", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-repo-ignore-"));
    const ignoreFile = path.join(root, ".gitignore");
    writeFileSync(ignoreFile, "dist/\n");
    const invalidation = new InvalidationService(new MemoryInvalidationRepository());
    invalidation.recordGenerated({
      derivedKind: "repo_map",
      rebuildSource: "repo-map:proj_01",
      ...collectRepoFingerprint(root, "repomix@1")
    });

    unlinkSync(ignoreFile);
    invalidation.invalidateChanged({
      derivedKinds: ["repo_map"],
      reason: "Ignore rules changed.",
      ...collectRepoFingerprint(root, "repomix@1")
    });

    expect(invalidation.status("repo_map")).toMatchObject({ fresh: 0, stale: 1 });
    expect(invalidation.status("repo_map").staleRecords[0]?.staleReason).toBe(
      "Ignore rules changed."
    );
  });
});
