import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeSubpathSha256,
  loadUpstreamSkills,
  removeUpstreamSkills,
  syncUpstreamSkills,
  syncUpstreamSkillsByNames,
  syncUpstreamSkillsBySource,
} from "../../apps/cli/src/upstream-skills.ts";
import { writeMarker } from "../../apps/cli/src/claude-plugin-markers.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;
let previousPath: string | undefined;
let previousAllowClaudeCli: string | undefined;

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

async function writeLock(path: string): Promise<void> {
  await writeFile(path, `
[meta]
schema_version = 1

[skills.tool-dir]
source = "https://github.com/example/tools"
subpath = "skills/tool-dir"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
subpath_sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
subpath_size = 10
vendor_canonical_agents = ["codex"]

[skills.tool-dir.claude_plugin]
marketplace = "example/tools"
name = "tools@example"

[skills.single-file]
source = "https://github.com/example/tools"
subpath = "single/SKILL.md"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "Apache-2.0"
author_class = "foundation"
pinned_on = "2026-05-02"
review_due = "2026-06-02"
kind = "file"
`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  return stdout.trim();
}

async function writeLocalGitSkillRepo(repo: string): Promise<string> {
  await mkdir(join(repo, "skills", "tool-dir", "nested"), { recursive: true });
  await mkdir(join(repo, "single"), { recursive: true });
  await writeFile(join(repo, "skills", "tool-dir", "SKILL.md"), "---\nname: tool-dir\n---\n# Tool Dir\n");
  await writeFile(join(repo, "skills", "tool-dir", "nested", "note.txt"), "kept");
  await writeFile(join(repo, "skills", "tool-dir", ".original.md"), "ignored");
  await writeFile(join(repo, "single", "SKILL.md"), "---\nname: pi-single-alias\n---\n# Single\n");
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "fulcrum-test@example.com"]);
  await git(repo, ["config", "user.name", "Fulcrum Test"]);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "test: seed upstream skill fixtures"]);
  return git(repo, ["rev-parse", "HEAD"]);
}

async function writeLocalLock(path: string, source: string, sha: string): Promise<void> {
  await writeFile(path, `
[meta]
schema_version = 1

[skills.tool-dir]
source = "${source}"
subpath = "skills/tool-dir"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"

[skills.single-file]
source = "${source}"
subpath = "single/SKILL.md"
ref = "main"
tree_sha = "${sha}"
license = "Apache-2.0"
author_class = "foundation"
pinned_on = "2026-05-02"
review_due = "2026-06-02"
kind = "file"
`);
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-upstream-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  previousPath = process.env["PATH"];
  previousAllowClaudeCli = process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  delete process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
  await mkdir(process.env["HOME"]!, { recursive: true });
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  if (previousAllowClaudeCli === undefined) delete process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
  else process.env["FULCRUM_ALLOW_CLAUDE_CLI"] = previousAllowClaudeCli;
  await rm(scratch, { recursive: true, force: true });
});

describe("upstream skills source helpers", () => {
  it("loads lock entries with plugin descriptors, canonical agents, and inferred kinds", async () => {
    const lockPath = join(scratch, "upstream.lock");
    await writeLock(lockPath);

    const skills = await loadUpstreamSkills(lockPath);

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      name: "tool-dir",
      kind: "dir",
      claude_plugin: { marketplace: "example/tools", name: "tools@example" },
      vendor_canonical_agents: ["codex"],
    });
    expect(skills[1]).toMatchObject({ name: "single-file", kind: "file" });
  });

  it("rejects invalid lock metadata with actionable errors", async () => {
    const lockPath = join(scratch, "bad.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills."../bad"]
source = "https://github.com/example/tools"
subpath = "../escape"
ref = "v1.0.0"
tree_sha = "not-a-sha"
license = "MIT"
author_class = "unknown"
pinned_on = "bad-date"
review_due = "2026-06-01"
vendor_canonical_agents = ["nobody"]
`);

    await expect(loadUpstreamSkills(lockPath)).rejects.toThrow(/tree_sha must be a 40-character hex SHA/);
    await expect(loadUpstreamSkills(lockPath)).rejects.toThrow(/subpath must stay inside repo cache/);
    await expect(loadUpstreamSkills(lockPath)).rejects.toThrow(/vendor_canonical_agents value 'nobody'/);
  });

  it("rejects malformed locks before any install work starts", async () => {
    const malformedPath = join(scratch, "malformed.lock");
    await writeFile(malformedPath, "[meta\nschema_version = 1");
    await expect(loadUpstreamSkills(malformedPath)).rejects.toThrow(/invalid TOML/);

    const wrongSchemaPath = join(scratch, "wrong-schema.lock");
    await writeFile(wrongSchemaPath, `
[meta]
schema_version = 2

[skills.tool-dir]
source = "https://github.com/example/tools"
subpath = "skills/tool-dir"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
`);
    await expect(loadUpstreamSkills(wrongSchemaPath)).rejects.toThrow(/schema_version must be 1/);

    const emptyPath = join(scratch, "empty.lock");
    await writeFile(emptyPath, `
[meta]
schema_version = 1
`);
    await expect(loadUpstreamSkills(emptyPath)).rejects.toThrow(/missing \[skills\.<name>\] entries/);
  });

  it("computes deterministic hashes for directories and single-file skills", async () => {
    const dir = join(scratch, "skill");
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: demo\n---\n");
    await writeFile(join(dir, "nested", "note.txt"), "hello");
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, ".git", "ignored"), "ignored");

    const first = await computeSubpathSha256(dir, "dir");
    const second = await computeSubpathSha256(dir, "dir");
    const single = await computeSubpathSha256(join(dir, "SKILL.md"), "file");

    expect(first).toEqual(second);
    expect(first.size).toBe("---\nname: demo\n---\n".length + "hello".length);
    expect(single.size).toBe("---\nname: demo\n---\n".length);
    expect(single.sha256).not.toBe(first.sha256);
  });

  it("surfaces filesystem failures while hashing missing skill paths", async () => {
    await expect(computeSubpathSha256(join(scratch, "missing", "SKILL.md"), "file")).rejects.toThrow();
    await expect(computeSubpathSha256(join(scratch, "missing-dir"), "dir")).rejects.toThrow();
  });

  it("syncs and removes dry-run plans across filtered skill sets without network", async () => {
    const lockPath = join(scratch, "upstream.lock");
    await writeLock(lockPath);
    await mkdir(join(process.env["HOME"]!, ".claude"), { recursive: true });
    await mkdir(join(process.env["HOME"]!, ".codex"), { recursive: true });
    await mkdir(join(process.env["HOME"]!, ".pi", "agent"), { recursive: true });
    await mkdir(join(process.env["HOME"]!, ".pi", "agent", "skills", "single-file"), { recursive: true });

    const syncLogs = await captureLogs(() => syncUpstreamSkills({
      dryRun: true,
      lockPath,
      agents: ["claude-code", "codex", "pi"],
    }));
    expect(syncLogs.join("\n")).toContain("would clone/update https://github.com/example/tools");
    expect(syncLogs.join("\n")).toContain("would run: claude plugin marketplace add example/tools");
    expect(syncLogs.join("\n")).toContain("vendor-canonical install handles Codex CLI; skip mirror");
    expect(syncLogs.join("\n")).toContain("would install file");

    const bySourceLogs = await captureLogs(() => syncUpstreamSkillsBySource("https://github.com/example/tools", { dryRun: true, lockPath }));
    expect(bySourceLogs.join("\n")).toContain("2 curated skill(s)");

    const byNameLogs = await captureLogs(() => syncUpstreamSkillsByNames(["single-file"], { dryRun: true, lockPath }));
    expect(byNameLogs.join("\n")).toContain("1 curated skill(s)");

    const removeLogs = await captureLogs(() => removeUpstreamSkills({
      dryRun: true,
      names: ["tool-dir", "single-file"],
      lockPath,
      agents: ["claude-code", "codex", "pi"],
    }));
    expect(removeLogs.join("\n")).toContain("would run: claude plugin uninstall tools@example");
    expect(removeLogs.join("\n")).toContain("vendor-canonical install handles Codex CLI; skip remove");
    expect(removeLogs.join("\n")).toContain("would remove:");
  });

  it("reports empty filtered syncs and excludes configured sources without touching network", async () => {
    const lockPath = join(scratch, "upstream.lock");
    await writeLock(lockPath);

    const missingSourceLogs = await captureLogs(() => syncUpstreamSkillsBySource("https://github.com/missing/source", {
      dryRun: true,
      lockPath,
    }));
    expect(missingSourceLogs.join("\n")).toContain("0 curated skill(s)");

    const missingNameLogs = await captureLogs(() => syncUpstreamSkillsByNames(["missing"], {
      dryRun: true,
      lockPath,
    }));
    expect(missingNameLogs.join("\n")).toContain("0 curated skill(s)");

    const excludedLogs = await captureLogs(() => syncUpstreamSkills({
      dryRun: true,
      lockPath,
      excludeSources: ["https://github.com/example/tools"],
    }));
    expect(excludedLogs.join("\n")).toContain("0 curated skill(s)");
  });

  it("syncs and removes real upstream skill copies from a local git source with ownership markers", async () => {
    const sourceRepo = join(scratch, "source-repo");
    await mkdir(sourceRepo, { recursive: true });
    const sha = await writeLocalGitSkillRepo(sourceRepo);
    const lockPath = join(scratch, "local-upstream.lock");
    await writeLocalLock(lockPath, sourceRepo, sha);
    await mkdir(join(process.env["HOME"]!, ".codex"), { recursive: true });
    await mkdir(join(process.env["HOME"]!, ".pi", "agent"), { recursive: true });
    await mkdir(join(process.env["HOME"]!, ".gemini"), { recursive: true });

    const syncLogs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      agents: ["codex", "pi", "gemini"],
      updatePins: true,
    }));
    const syncOutput = syncLogs.join("\n");

    expect(syncOutput).toContain("subpath_sha256 not pinned");
    expect(syncOutput).toContain("Wrote 2 new subpath pin(s)");
    expect(await readFile(join(process.env["HOME"]!, ".codex", "skills", "tool-dir", "SKILL.md"), "utf8")).toContain("# Tool Dir");
    expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "tool-dir", ".original.md"))).toBe(false);
    expect(await readFile(join(process.env["HOME"]!, ".codex", "skills", "single-file", "SKILL.md"), "utf8")).toContain("# Single");
    expect(await readFile(join(process.env["HOME"]!, ".pi", "agent", "skills", "pi-single-alias", "SKILL.md"), "utf8")).toContain("pi-single-alias");
    expect(await readFile(join(process.env["HOME"]!, ".gemini", "skills", "tool-dir", "nested", "note.txt"), "utf8")).toBe("kept");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "codex", "tool-dir.installed"))).toBe(true);
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "pi", "pi-single-alias.installed"))).toBe(true);
    expect(await readFile(lockPath, "utf8")).toContain("subpath_sha256");

    const removeLogs = await captureLogs(() => removeUpstreamSkills({
      lockPath,
      agents: ["codex", "pi", "gemini"],
      names: ["tool-dir", "single-file"],
    }));
    const removeOutput = removeLogs.join("\n");

    expect(removeOutput).toContain("removed:");
    expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "tool-dir"))).toBe(false);
    expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "single-file"))).toBe(false);
    expect(await exists(join(process.env["HOME"]!, ".pi", "agent", "skills", "pi-single-alias"))).toBe(false);
    expect(await exists(join(process.env["HOME"]!, ".gemini", "skills", "tool-dir"))).toBe(false);
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "codex", "tool-dir.installed"))).toBe(false);
  });

  it("aborts real sync when pinned subpath integrity does not match the checked out source", async () => {
    const sourceRepo = join(scratch, "source-repo");
    await mkdir(sourceRepo, { recursive: true });
    const sha = await writeLocalGitSkillRepo(sourceRepo);
    const lockPath = join(scratch, "local-upstream.lock");
    await writeLocalLock(lockPath, sourceRepo, sha);
    const raw = await readFile(lockPath, "utf8");
    await writeFile(lockPath, raw.replace(
      "[skills.tool-dir]\n",
      "[skills.tool-dir]\nsubpath_sha256 = \"0000000000000000000000000000000000000000000000000000000000000000\"\n",
    ));

    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit:1");
    }) as never);
    const errorSpy = spyOn(console, "error").mockImplementation(mock(() => {}));

    try {
      await expect(syncUpstreamSkills({ lockPath, agents: ["codex"] })).rejects.toThrow("process.exit:1");
      expect(errorSpy).toHaveBeenCalledWith("Upstream skill subpath integrity check failed. Aborting install.");
      expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "tool-dir"))).toBe(false);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("skips unsafe or missing upstream paths without creating agent skill directories", async () => {
    const sourceRepo = join(scratch, "source-repo");
    await mkdir(sourceRepo, { recursive: true });
    const sha = await writeLocalGitSkillRepo(sourceRepo);
    const lockPath = join(scratch, "missing-upstream.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.missing-dir]
source = "${sourceRepo}"
subpath = "skills/missing-dir"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"

[skills.missing-file]
source = "${sourceRepo}"
subpath = "single/missing.md"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
kind = "file"
`);
    await mkdir(join(process.env["HOME"]!, ".codex"), { recursive: true });

    const logs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      agents: ["codex"],
      updatePins: true,
    }));
    const output = logs.join("\n");

    expect(output).toContain("missing upstream path");
    expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "missing-dir"))).toBe(false);
    expect(await exists(join(process.env["HOME"]!, ".codex", "skills", "missing-file"))).toBe(false);
  });

  it("refuses to remove upstream mirrors that do not have Fulcrum ownership markers", async () => {
    const lockPath = join(scratch, "upstream.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.tool-dir]
source = "https://github.com/example/tools"
subpath = "skills/tool-dir"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
`);
    const codexSkill = join(process.env["HOME"]!, ".codex", "skills", "tool-dir");
    await mkdir(codexSkill, { recursive: true });
    await writeFile(join(codexSkill, "SKILL.md"), "---\nname: user-owned\n---\n# User Skill\n");

    const logs = await captureLogs(() => removeUpstreamSkills({
      lockPath,
      agents: ["codex"],
      names: ["tool-dir"],
    }));

    expect(logs.join("\n")).toContain("Fulcrum marker not present");
    expect(await exists(codexSkill)).toBe(true);
  });

  it("removes single-file upstream mirrors by both lock name and file placement name when owned", async () => {
    const lockPath = join(scratch, "single-file-placement.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.pretty-tool]
source = "https://github.com/example/tools"
subpath = "tools/pretty.md"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
kind = "file"
`);
    const codexRoot = join(process.env["HOME"]!, ".codex", "skills");
    const markerRoot = join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "codex");
    await mkdir(join(codexRoot, "pretty-tool"), { recursive: true });
    await mkdir(join(codexRoot, "pretty"), { recursive: true });
    await mkdir(markerRoot, { recursive: true });
    await writeFile(join(codexRoot, "pretty-tool", "SKILL.md"), "owned logical name\n");
    await writeFile(join(codexRoot, "pretty", "SKILL.md"), "owned placement name\n");
    await writeFile(join(markerRoot, "pretty-tool.installed"), "owned\n");
    await writeFile(join(markerRoot, "pretty.installed"), "owned\n");

    const logs = await captureLogs(() => removeUpstreamSkills({
      lockPath,
      agents: ["codex"],
      names: ["pretty-tool"],
    }));

    expect(logs.join("\n")).toContain("removed:");
    expect(await exists(join(codexRoot, "pretty-tool"))).toBe(false);
    expect(await exists(join(codexRoot, "pretty"))).toBe(false);
    expect(await exists(join(markerRoot, "pretty-tool.installed"))).toBe(false);
    expect(await exists(join(markerRoot, "pretty.installed"))).toBe(false);
  });

  it("updates subpath pins while preserving nested Claude plugin metadata in the real lockfile", async () => {
    const sourceRepo = join(scratch, "source-repo");
    await mkdir(sourceRepo, { recursive: true });
    const sha = await writeLocalGitSkillRepo(sourceRepo);
    const lockPath = join(scratch, "pins-with-subtable.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.tool-dir]
source = "${sourceRepo}"
subpath = "skills/tool-dir"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"

[skills.tool-dir.claude_plugin]
marketplace = "example/tools"
name = "tools@example"
`);
    await mkdir(join(process.env["HOME"]!, ".codex"), { recursive: true });

    const logs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      agents: ["codex"],
      updatePins: true,
    }));
    const lock = await readFile(lockPath, "utf8");

    expect(logs.join("\n")).toContain("Wrote 1 new subpath pin(s)");
    expect(lock).toContain("subpath_sha256 = ");
    expect(lock).toContain("subpath_size = ");
    expect(lock).toContain("[skills.tool-dir.claude_plugin]");
    expect(lock).toContain('name = "tools@example"');
    expect(await readFile(join(process.env["HOME"]!, ".codex", "skills", "tool-dir", "SKILL.md"), "utf8")).toContain("# Tool Dir");
  });

  it("ignores unsafe Pi frontmatter names and keeps the lockfile skill name as the install path", async () => {
    const sourceRepo = join(scratch, "unsafe-pi-repo");
    await mkdir(join(sourceRepo, "skill"), { recursive: true });
    await writeFile(join(sourceRepo, "skill", "SKILL.md"), "---\nname: ../escape\n---\n# Unsafe Pi Name\n");
    await git(sourceRepo, ["init", "-b", "main"]);
    await git(sourceRepo, ["config", "user.email", "fulcrum-test@example.com"]);
    await git(sourceRepo, ["config", "user.name", "Fulcrum Test"]);
    await git(sourceRepo, ["add", "."]);
    await git(sourceRepo, ["commit", "-m", "test: unsafe pi frontmatter"]);
    const sha = await git(sourceRepo, ["rev-parse", "HEAD"]);
    const lockPath = join(scratch, "unsafe-pi.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.safe-pi]
source = "${sourceRepo}"
subpath = "skill"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
`);
    await mkdir(join(process.env["HOME"]!, ".pi", "agent"), { recursive: true });

    const logs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      agents: ["pi"],
      updatePins: true,
    }));

    expect(logs.join("\n")).toContain("unsafe Pi frontmatter name ignored");
    expect(await readFile(join(process.env["HOME"]!, ".pi", "agent", "skills", "safe-pi", "SKILL.md"), "utf8")).toContain("# Unsafe Pi Name");
    expect(await exists(join(process.env["HOME"]!, ".pi", "agent", "skills", "escape"))).toBe(false);
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "pi", "safe-pi.installed"))).toBe(true);
  });

  it("keeps Claude plugin removal marker-gated instead of touching unowned plugins", async () => {
    const lockPath = join(scratch, "claude-plugin-remove.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.claude-tool]
source = "https://github.com/example/tools"
subpath = "skills/claude-tool"
ref = "v1.0.0"
tree_sha = "0123456789abcdef0123456789abcdef01234567"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"

[skills.claude-tool.claude_plugin]
marketplace = "example/tools"
name = "tools@example"
`);
    await mkdir(join(process.env["HOME"]!, ".claude"), { recursive: true });

    const logs = await captureLogs(() => removeUpstreamSkills({
      lockPath,
      agents: ["claude-code"],
      names: ["claude-tool"],
    }));
    const output = logs.join("\n");

    expect(output).toContain("Claude Code plugins");
    expect(output.includes("claude not on PATH") || output.includes("manual: claude plugin uninstall tools@example")).toBe(true);
  });

  it("falls back to real file-copy install when a Fulcrum-owned Claude plugin install command fails", async () => {
    const sourceRepo = join(scratch, "claude-fallback-source");
    await mkdir(sourceRepo, { recursive: true });
    const sha = await writeLocalGitSkillRepo(sourceRepo);
    const lockPath = join(scratch, "claude-fallback.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.tool-dir]
source = "${sourceRepo}"
subpath = "skills/tool-dir"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"

[skills.tool-dir.claude_plugin]
marketplace = "example/tools"
name = "tools@example"
`);
    await mkdir(join(process.env["HOME"]!, ".claude"), { recursive: true });
    await writeMarker({
      plugin: "tools@example",
      marketplace: "example/tools",
      source: "test",
      operation: "install",
    });
    const bin = join(scratch, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), "#!/bin/sh\necho claude failed >&2\nexit 23\n");
    await chmod(join(bin, "claude"), 0o755);
    process.env["PATH"] = `${bin}:${previousPath ?? ""}`;

    const logs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      updatePins: true,
      agents: ["claude-code"],
    }));
    const output = logs.join("\n");

    expect(output).toContain("claude plugin marketplace add failed");
    expect(output).toContain("file copy fallback");
    expect(await readFile(join(process.env["HOME"]!, ".claude", "skills", "tool-dir", "SKILL.md"), "utf8")).toContain("# Tool Dir");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "claude-code", "tool-dir.installed"))).toBe(true);
  });

  it("removes stale lock-name Pi mirror after installing the safe frontmatter alias", async () => {
    const sourceRepo = join(scratch, "pi-alias-source");
    await mkdir(join(sourceRepo, "skill"), { recursive: true });
    await writeFile(join(sourceRepo, "skill", "SKILL.md"), "---\nname: real-pi-alias\n---\n# Aliased Pi Skill\n");
    await git(sourceRepo, ["init", "-b", "main"]);
    await git(sourceRepo, ["config", "user.email", "fulcrum-test@example.com"]);
    await git(sourceRepo, ["config", "user.name", "Fulcrum Test"]);
    await git(sourceRepo, ["add", "."]);
    await git(sourceRepo, ["commit", "-m", "test: seed pi alias skill"]);
    const sha = await git(sourceRepo, ["rev-parse", "HEAD"]);
    const lockPath = join(scratch, "pi-alias.lock");
    await writeFile(lockPath, `
[meta]
schema_version = 1

[skills.lock-name]
source = "${sourceRepo}"
subpath = "skill"
ref = "main"
tree_sha = "${sha}"
license = "MIT"
author_class = "tool-vendor"
pinned_on = "2026-05-01"
review_due = "2026-06-01"
`);
    await mkdir(join(process.env["HOME"]!, ".pi", "agent", "skills", "lock-name"), { recursive: true });
    await writeFile(join(process.env["HOME"]!, ".pi", "agent", "skills", "lock-name", "SKILL.md"), "stale lock-name copy");
    await mkdir(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "pi"), { recursive: true });
    await writeFile(join(process.env["FULCRUM_HOME"]!, "state", "global", "upstream-skills", "pi", "lock-name.installed"), "old marker\n");

    const logs = await captureLogs(() => syncUpstreamSkills({
      lockPath,
      updatePins: true,
      agents: ["pi"],
    }));

    expect(logs.join("\n")).toContain("lock-name → real-pi-alias");
    expect(await exists(join(process.env["HOME"]!, ".pi", "agent", "skills", "lock-name"))).toBe(false);
    expect(await readFile(join(process.env["HOME"]!, ".pi", "agent", "skills", "real-pi-alias", "SKILL.md"), "utf8")).toContain("# Aliased Pi Skill");
  });

});
