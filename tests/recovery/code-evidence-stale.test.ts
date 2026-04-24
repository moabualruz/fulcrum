import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodeEvidenceService,
  FileCodeEvidenceRepository,
  FileProjectRepository,
  FileWorkRepository,
  InvalidationService,
  MemoryInvalidationRepository,
  ProjectRegistryService
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";

describe("code evidence stale cleanup", () => {
  it("marks evidence stale after rename or delete", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-stale-"));
    const source = path.join(rootPath, "old.ts");
    await writeFile(source, "export const staleNeedle = true;\n");
    const work = new FileWorkRepository(path.join(rootPath, ".fulcrum", "work.json"));
    const projectRepository = new FileProjectRepository(work);
    const evidenceRepository = new FileCodeEvidenceRepository(work);
    const project = new ProjectRegistryService(projectRepository).register({ rootPath });
    const code = new CodeEvidenceService(
      projectRepository,
      evidenceRepository,
      { search: (options) => searchExact(options) },
      searchSemantic
    );
    await code.search({ projectId: project.projectId, query: "staleNeedle" });

    await rename(source, path.join(rootPath, "new.ts"));
    const staleAfterRename = code.cleanupStale(project.projectId);
    await rm(path.join(rootPath, "new.ts"));

    expect(staleAfterRename).toHaveLength(1);
    expect(staleAfterRename[0].freshness).toBe("stale");
    expect(evidenceRepository.list(project.projectId)[0].staleAt).toBeDefined();
  });

  it("marks evidence stale after content or ignored-path changes", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-stale-policy-"));
    const source = path.join(rootPath, "source.ts");
    await writeFile(source, "export const movingNeedle = true;\n");
    const work = new FileWorkRepository(path.join(rootPath, ".fulcrum", "work.json"));
    const projectRepository = new FileProjectRepository(work);
    const evidenceRepository = new FileCodeEvidenceRepository(work);
    const project = new ProjectRegistryService(projectRepository).register({ rootPath });
    const code = new CodeEvidenceService(
      projectRepository,
      evidenceRepository,
      { search: (options) => searchExact(options) },
      searchSemantic
    );
    await code.search({ projectId: project.projectId, query: "movingNeedle" });

    await writeFile(source, "export const replacement = true;\n");
    const staleAfterContentChange = code.cleanupStale(project.projectId);
    await code.search({ projectId: project.projectId, query: "replacement" });
    await writeFile(path.join(rootPath, ".fulcrumignore"), "source.ts\n");
    const staleAfterIgnoreChange = code.cleanupStale(project.projectId);

    expect(staleAfterContentChange).toHaveLength(1);
    expect(staleAfterContentChange[0].freshness).toBe("stale");
    expect(staleAfterIgnoreChange).toHaveLength(1);
    expect(staleAfterIgnoreChange[0].ignoredPathStatus).toBe("not_ignored");
  });

  it("scopes invalidation records to the changed project", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-stale-scope-"));
    const rootA = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-stale-a-"));
    const rootB = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-stale-b-"));
    await writeFile(path.join(rootA, "source.ts"), "export const scopedNeedle = true;\n");
    await writeFile(path.join(rootB, "source.ts"), "export const scopedNeedle = true;\n");

    const work = new FileWorkRepository(path.join(stateRoot, ".fulcrum", "work.json"));
    const projectRepository = new FileProjectRepository(work);
    const evidenceRepository = new FileCodeEvidenceRepository(work);
    const invalidation = new InvalidationService(new MemoryInvalidationRepository());
    const projects = new ProjectRegistryService(projectRepository);
    const projectA = projects.register({ rootPath: rootA });
    const projectB = projects.register({ rootPath: rootB });
    const code = new CodeEvidenceService(
      projectRepository,
      evidenceRepository,
      { search: (options) => searchExact(options) },
      searchSemantic,
      undefined,
      invalidation
    );

    await code.search({ projectId: projectA.projectId, query: "scopedNeedle" });
    await code.search({ projectId: projectB.projectId, query: "scopedNeedle" });
    await rename(path.join(rootA, "source.ts"), path.join(rootA, "renamed.ts"));

    code.cleanupStale(projectA.projectId);

    expect(invalidation.status("code_evidence")).toMatchObject({ total: 2, fresh: 1, stale: 1 });
    expect(invalidation.status("code_evidence").staleRecords[0]?.rebuildSource).toContain(
      projectA.projectId
    );
  });
});
