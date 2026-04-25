import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodeToolCacheMetadata,
  buildRepoMapEvidence,
  buildRepoPackEvidence,
  runAstGrep,
  runFd,
  runRepomix,
  searchStructural
} from "@fulcrum/code-tools";

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
    writeFileSync(
      path.join(bin, "ast-grep"),
      [
        "#!/usr/bin/env sh",
        "cat <<'JSON'",
        '[{"file":"README.md","text":"# Adapter","range":{"start":{"line":1},"end":{"line":1}}}]',
        "JSON"
      ].join("\n")
    );
    writeFileSync(
      path.join(bin, "repomix"),
      [
        "#!/usr/bin/env sh",
        "out=''",
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = \'-o\' ]; then shift; out="$1"; fi',
        "  shift",
        "done",
        'printf \'{"files":[]}\' > "$out"',
        "printf 'packed\\n'"
      ].join("\n")
    );
    chmodSync(path.join(bin, "fd"), 0o755);
    chmodSync(path.join(bin, "ast-grep"), 0o755);
    chmodSync(path.join(bin, "repomix"), 0o755);
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
      const structural = await searchStructural({
        rootPath: root,
        pattern: "$A"
      });
      expect(structural.state).toBe("available");
      expect(structural.results[0]).toMatchObject({
        filePath: "README.md",
        evidenceType: "structural",
        sourceTool: "ast-grep"
      });
      const repomix = await runRepomix({ rootPath: root });
      expect(repomix.state).toBe("managed");
      expect(repomix.stdout).toContain("outputPath=");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { force: true, recursive: true });
      rmSync(bin, { force: true, recursive: true });
    }
  });

  it("builds repo-map evidence and an honest local repo-pack fallback when Repomix is absent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-repo-evidence-"));
    const previousPath = process.env.PATH;
    writeFileSync(path.join(root, "README.md"), "# Repo\n");
    process.env.PATH = "";

    try {
      const repoMap = buildRepoMapEvidence({
        projectId: "proj_repo",
        rootPath: root,
        ignoredPathPolicyId: "ignored",
        limit: 10
      });
      const pack = buildRepoPackEvidence({
        projectId: "proj_repo",
        rootPath: root,
        ignoredPathPolicyId: "ignored",
        limit: 10
      });

      expect(repoMap.refs[0]).toMatchObject({ path: "README.md" });
      expect(pack).toMatchObject({
        toolIdentity: "fulcrum.local-repo-pack",
        state: "degraded",
        includedFiles: ["README.md"]
      });
      expect(pack.limitations[0]).toContain("Repomix executable unavailable");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps nested path filters traversable for repo-map and repo-pack evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-repo-path-filter-"));
    const previousPath = process.env.PATH;
    mkdirSync(path.join(root, "src", "feature"), { recursive: true });
    writeFileSync(path.join(root, "src", "feature", "target.ts"), "export const target = true;\n");
    writeFileSync(path.join(root, "src", "other.ts"), "export const other = true;\n");
    process.env.PATH = "";

    try {
      const repoMap = buildRepoMapEvidence({
        projectId: "proj_repo",
        rootPath: root,
        paths: ["src/feature/target.ts"],
        limit: 10
      });
      const pack = buildRepoPackEvidence({
        projectId: "proj_repo",
        rootPath: root,
        paths: ["src/feature/target.ts"],
        limit: 10
      });

      expect(repoMap.refs.map((ref) => ref.path)).toEqual(["src/feature/target.ts"]);
      expect(pack.includedFiles).toEqual(["src/feature/target.ts"]);
      expect(pack.contentPreview).toContain("export const target");
      expect(pack.contentPreview).not.toContain("export const other");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("marks malformed ast-grep output degraded instead of throwing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-bad-ast-grep-"));
    const bin = mkdtempSync(path.join(tmpdir(), "fulcrum-bad-ast-grep-bin-"));
    const previousPath = process.env.PATH;
    writeFileSync(path.join(root, "example.ts"), "const value = 1;\n");
    writeFileSync(path.join(bin, "ast-grep"), "#!/usr/bin/env sh\nprintf 'not json\\n'\n");
    chmodSync(path.join(bin, "ast-grep"), 0o755);
    process.env.PATH = previousPath ? `${bin}${path.delimiter}${previousPath}` : bin;

    try {
      await expect(searchStructural({ rootPath: root, pattern: "$A" })).resolves.toMatchObject({
        state: "degraded",
        results: []
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { force: true, recursive: true });
      rmSync(bin, { force: true, recursive: true });
    }
  });
});
