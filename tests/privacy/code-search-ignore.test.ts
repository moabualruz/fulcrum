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

describe("code search ignored-path privacy", () => {
  it("excludes ignored files from exact and path results", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fulcrum-code-ignore-"));
    await mkdir(path.join(rootPath, "secret"), { recursive: true });
    await writeFile(path.join(rootPath, ".fulcrumignore"), "secret/\n*.local\n");
    await writeFile(path.join(rootPath, "visible.ts"), "const token = 'VISIBLE_NEEDLE';\n");
    await writeFile(path.join(rootPath, "secret", "hidden.ts"), "const token = 'HIDDEN_NEEDLE';\n");
    await writeFile(path.join(rootPath, "config.local"), "HIDDEN_NEEDLE\n");
    const work = new FileWorkRepository(path.join(rootPath, ".fulcrum", "work.json"));
    const projectRepository = new FileProjectRepository(work);
    const project = new ProjectRegistryService(projectRepository).register({ rootPath });
    const code = new CodeEvidenceService(
      projectRepository,
      new FileCodeEvidenceRepository(work),
      { search: (options) => searchExact(options) },
      searchSemantic
    );

    const hidden = await code.search({ projectId: project.projectId, query: "HIDDEN_NEEDLE" });
    const visible = await code.search({ projectId: project.projectId, query: "VISIBLE_NEEDLE" });

    expect(hidden.count).toBe(0);
    expect(hidden.ignoredPathBehavior.excludedPatterns).toBe(2);
    expect(hidden.ignoredPathBehavior.sources).toContain(".fulcrumignore");
    expect(visible.evidence.map((item) => item.filePath)).toEqual(["visible.ts"]);
  });
});
