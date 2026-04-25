import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodeEvidenceSchema } from "@fulcrum/shared";
import {
  CodeEvidenceService,
  FileCodeEvidenceRepository,
  FileProjectRepository,
  FileWorkRepository,
  ProjectRegistryService
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";

describe("code search contract", () => {
  it("returns code evidence with provenance, freshness, ignore behavior, and ranking reason", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-contract-"));
    await writeFile(path.join(rootPath, "index.ts"), "export const README_TOKEN = 'README';\n");
    const work = new FileWorkRepository(path.join(rootPath, ".fulcrum", "work.json"));
    const projects = new ProjectRegistryService(new FileProjectRepository(work));
    const project = projects.register({ rootPath });
    const service = new CodeEvidenceService(
      new FileProjectRepository(work),
      new FileCodeEvidenceRepository(work),
      { search: (options) => searchExact(options) },
      searchSemantic
    );

    const result = await service.search({ projectId: project.projectId, query: "README" });

    expect(result.count).toBeGreaterThan(0);
    expect(result.ignoredPathBehavior.status).toBe("honored");
    expect(result.evidence.every((item) => CodeEvidenceSchema.safeParse(item).success)).toBe(true);
    expect(result.evidence[0]).toMatchObject({
      projectId: project.projectId,
      query: "README",
      filePath: "index.ts",
      freshness: "fresh"
    });
    expect(result.evidence[0].reason).toContain("exact local search");
  });

  it("reports degraded search instead of success when the project root is missing", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-missing-state-"));
    const missingRoot = path.join(os.tmpdir(), `fulcrum-missing-code-root-${Date.now()}`);
    const work = new FileWorkRepository(path.join(stateRoot, ".fulcrum", "work.json"));
    const projects = new ProjectRegistryService(new FileProjectRepository(work));
    const project = projects.register({ rootPath: missingRoot });
    const service = new CodeEvidenceService(
      new FileProjectRepository(work),
      new FileCodeEvidenceRepository(work),
      { search: (options) => searchExact(options) },
      searchSemantic
    );

    const result = await service.search({ projectId: project.projectId, query: "anything" });

    expect(result.count).toBe(0);
    expect(result.degraded).toEqual([
      expect.objectContaining({
        capabilityId: "cap_code_search",
        state: "degraded",
        nextAction: expect.stringContaining(missingRoot)
      })
    ]);
  });
});
