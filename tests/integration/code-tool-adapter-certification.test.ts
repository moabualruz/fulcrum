import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodeToolCacheMetadata, runAstGrep, runFd, runRepomix } from "@fulcrum/code-tools";

describe("code tool adapter certification", () => {
  it("records version, config hash, repo commit, included files, and degraded fallback", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-code-tools-"));
    writeFileSync(path.join(root, "tool.config"), "include=src\n");
    writeFileSync(path.join(root, "example.ts"), "export const value = 1;\n");

    try {
      const metadata = await buildCodeToolCacheMetadata({
        rootPath: root,
        tool: "definitely-missing-tool",
        configPaths: ["tool.config"],
        includedFiles: ["example.ts"],
        ignoredPaths: ["node_modules"]
      });
      const astGrep = await runAstGrep({
        rootPath: root,
        pattern: "const $A = $B",
        ignoredPaths: ["dist"]
      });
      const repomix = await runRepomix({ rootPath: root, ignoredPaths: ["node_modules"] });

      expect(metadata.version).toBe("unavailable");
      expect(metadata.configHash).toHaveLength(64);
      expect(metadata.includedFiles).toEqual(["example.ts"]);
      expect(metadata.ignoredPaths).toEqual(["node_modules"]);
      expect(astGrep.metadata.tool).toBe("ast-grep");
      expect(astGrep.metadata.ignoredPaths).toEqual(["dist"]);
      expect(["managed", "degraded"]).toContain(astGrep.state);
      expect(repomix.metadata.tool).toBe("repomix");
      expect(repomix.metadata.ignoredPaths).toEqual(["node_modules"]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("uses fd wrapper when command is available and preserves local fallback when absent", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-fd-"));
    const bin = mkdtempSync(path.join(tmpdir(), "fulcrum-fd-bin-"));
    const previousPath = process.env.PATH;
    writeFileSync(path.join(root, "README.md"), "# Adapter\n");
    writeFileSync(path.join(bin, "fd"), "#!/usr/bin/env sh\nprintf 'README.md\\n'\n");
    chmodSync(path.join(bin, "fd"), 0o755);
    process.env.PATH = previousPath ? `${bin}${path.delimiter}${previousPath}` : bin;

    try {
      const result = await runFd({
        rootPath: root,
        query: "README",
        ignoredPaths: ["node_modules"]
      });

      expect(result.state).toBe("managed");
      expect(result.stdout).toContain("README.md");
      expect(result.metadata.tool).toBe("fd");
      expect(result.metadata.includedFiles).toEqual(["README.md"]);
      expect(result.metadata.ignoredPaths).toEqual(["node_modules"]);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { force: true, recursive: true });
      rmSync(bin, { force: true, recursive: true });
    }
  });
});
