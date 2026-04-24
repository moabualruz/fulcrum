import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodeEvidenceService,
  FileCodeEvidenceRepository,
  FileProjectRepository,
  FileWorkRepository,
  ProjectRegistryService
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";

describe("exact/path/string code search", () => {
  it("finds identifiers, paths, strings, imports, and exports with source refs", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-exact-"));
    await mkdir(path.join(rootPath, "src"), { recursive: true });
    await writeFile(
      path.join(rootPath, "src", "search-target.ts"),
      "import { readFile } from 'node:fs/promises';\nconst FulcrumToken = 'needle string';\nexport const exportedNeedle = FulcrumToken;\nthrow new Error('ExactFailure');\n"
    );
    const service = createService(rootPath);
    const project = service.projects.register({ rootPath });

    const identifier = await service.code.search({
      projectId: project.projectId,
      query: "FulcrumToken"
    });
    const pathResult = await service.code.search({
      projectId: project.projectId,
      query: "search-target"
    });
    const error = await service.code.search({
      projectId: project.projectId,
      query: "ExactFailure"
    });
    const importResult = await service.code.search({
      projectId: project.projectId,
      query: "readFile"
    });
    const exportResult = await service.code.search({
      projectId: project.projectId,
      query: "exportedNeedle"
    });

    expect(identifier.evidence.some((item) => item.evidenceType === "exact_identifier")).toBe(true);
    expect(identifier.evidence.some((item) => item.evidenceType === "import")).toBe(false);
    expect(pathResult.evidence.some((item) => item.evidenceType === "filename")).toBe(true);
    expect(error.evidence.some((item) => item.evidenceType === "error")).toBe(true);
    expect(importResult.evidence.some((item) => item.evidenceType === "import")).toBe(true);
    expect(exportResult.evidence.some((item) => item.evidenceType === "export")).toBe(true);
    expect(error.evidence[0].filePath).toBe("src/search-target.ts");
    expect(error.evidence[0].lineStart).toBeGreaterThan(0);
  });
});

function createService(rootPath: string) {
  const work = new FileWorkRepository(path.join(rootPath, ".fulcrum", "work.json"));
  const projectRepository = new FileProjectRepository(work);
  return {
    projects: new ProjectRegistryService(projectRepository),
    code: new CodeEvidenceService(
      projectRepository,
      new FileCodeEvidenceRepository(work),
      { search: (options) => searchExact(options) },
      searchSemantic
    )
  };
}
