import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeAuthoredSkills, run, syncSkills } from "../../apps/cli/src/skills.ts";
import { writeMarker } from "../../apps/cli/src/claude-plugin-markers.ts";

let scratch: string;
let previousHome: string | undefined;
let previousRepoDir: string | undefined;
let previousCodexScope: string | undefined;
let previousFulcrumHome: string | undefined;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  console.error = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return logs;
}

async function writeSkill(root: string, name: string, description = `${name} description`): Promise<void> {
  await mkdir(join(root, "skills", name, "refs"), { recursive: true });
  await writeFile(join(root, "skills", name, "SKILL.md"), [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    "## When to use",
    "Use in tests.",
    "## Invocation",
    "Run command.",
    "## Patterns",
    "Prefer fixtures.",
    "## Anti-patterns",
    "Avoid global state.",
    "## Cross-refs",
    "None.",
    "",
  ].join("\n"));
  await writeFile(join(root, "skills", name, "refs", "extra.txt"), "extra");
  await writeFile(join(root, "skills", name, "backup.original.md"), "source backup");
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skills-source-"));
  previousHome = process.env["HOME"];
  previousRepoDir = process.env["FULCRUM_REPO_DIR"];
  previousCodexScope = process.env["FULCRUM_CODEX_SKILLS_SCOPE"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  process.env["FULCRUM_REPO_DIR"] = scratch;
  delete process.env["FULCRUM_CODEX_SKILLS_SCOPE"];
  await mkdir(process.env["HOME"]!, { recursive: true });
  await writeSkill(scratch, "tool-a", "Tool A handles project-scoped sync.");
  await writeSkill(scratch, "tool-b", "Tool B handles metadata listing.");
  await mkdir(join(scratch, "evals"), { recursive: true });
  await writeFile(join(scratch, "evals", "tool-a.json"), JSON.stringify([{ prompt: "use tool a" }, { prompt: "again" }]));
  await mkdir(join(scratch, "rules"), { recursive: true });
  await writeFile(join(scratch, "rules", "AGENTS.md"), "short rules\n");
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousRepoDir === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = previousRepoDir;
  if (previousCodexScope === undefined) delete process.env["FULCRUM_CODEX_SKILLS_SCOPE"];
  else process.env["FULCRUM_CODEX_SKILLS_SCOPE"] = previousCodexScope;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("skills source commands", () => {
  it("lists authored skills with eval metadata and installed skill budgets", async () => {
    const authored = await captureLogs(() => run(["list"]));
    expect(authored.join("\n")).toContain("2 authored skills");
    expect(authored.join("\n")).toContain("tool-a");
    expect(authored.join("\n")).toContain("2 eval entries");
    expect(authored.join("\n")).toContain("no eval");

    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex", "skills", "one"), { recursive: true });
    await writeFile(join(home, ".codex", "skills", "one", "SKILL.md"), "---\nname: one\ndescription: installed\n---\n");

    const installed = await captureLogs(() => run(["list", "--installed"]));
    expect(installed.join("\n")).toContain("Installed skill metadata budget");
    expect(installed.join("\n")).toContain("Codex CLI");
  });

  it("lints valid skills and reports invalid frontmatter/sections", async () => {
    const valid = await captureLogs(() => run(["lint", join(scratch, "skills")]));
    expect(valid.join("\n")).toContain("✓");
    expect(valid.join("\n")).toContain("rules/AGENTS.md");

    await mkdir(join(scratch, "skills", "BadName"), { recursive: true });
    await writeFile(join(scratch, "skills", "BadName", "SKILL.md"), "---\nname: BadName\ndescription: <bad>\n---\n");

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: string | number | null) => {
      exitCode = typeof code === "number" ? code : 0;
      throw new Error(`exit ${exitCode}`);
    }) as typeof process.exit;
    try {
      const invalid = await captureLogs(async () => {
        await expect(run(["lint", join(scratch, "skills")])).rejects.toThrow("exit 1");
      });
      expect(exitCode).toBe(1);
      expect(invalid.join("\n")).toContain("must be lowercase");
      expect(invalid.join("\n")).toContain("description contains XML-like tags");
      expect(invalid.join("\n")).toContain("missing or out-of-order");
    } finally {
      process.exit = originalExit;
    }
  });

  it("syncs authored skills to project/global Codex and Gemini roots with pruning", async () => {
    const home = process.env["HOME"]!;
    const project = join(scratch, "consumer");
    await mkdir(join(home, ".codex", "skills", "fulcrum", "stale"), { recursive: true });
    await writeFile(join(home, ".codex", "skills", "fulcrum", "stale", "SKILL.md"), "stale");
    await mkdir(join(home, ".gemini"), { recursive: true });

    await syncSkills({ codexScope: "global", agents: ["codex", "gemini"] });

    expect(await readFile(join(home, ".codex", "skills", "fulcrum", "tool-a", "SKILL.md"), "utf8")).toContain("Tool A");
    expect(await exists(join(home, ".codex", "skills", "fulcrum", "tool-a", "backup.original.md"))).toBe(false);
    expect(await exists(join(home, ".codex", "skills", "fulcrum", "stale"))).toBe(false);
    expect(JSON.parse(await readFile(join(home, ".gemini", "extensions", "fulcrum-skills", "gemini-extension.json"), "utf8")).name).toBe("fulcrum-skills");
    expect(await readFile(join(home, ".gemini", "extensions", "fulcrum-skills", "skills", "tool-b", "SKILL.md"), "utf8")).toContain("Tool B");

    await syncSkills({ codexScope: "project", projectDir: project, agents: ["codex"] });
    expect(await readFile(join(project, ".codex", "skills", "fulcrum", "tool-a", "SKILL.md"), "utf8")).toContain("Tool A");
  });

  it("removes authored skill mirrors and reports dry-run sync plans", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    process.env["FULCRUM_CODEX_SKILLS_SCOPE"] = "global";

    const dryRun = await captureLogs(() => run(["sync", "--dry-run", "--codex-global"]));
    expect(dryRun.join("\n")).toContain("[dry-run] would mkdir");

    await run(["sync", "--codex-global"]);
    expect(await exists(join(home, ".codex", "skills", "fulcrum", "tool-a"))).toBe(true);

    await removeAuthoredSkills({ agents: ["codex"] });
    expect(await exists(join(home, ".codex", "skills", "fulcrum"))).toBe(false);
  });

  it("refreshes already-installed Claude plugin skill packages and prunes legacy layout", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(scratch, ".claude-plugin"), { recursive: true });
    await writeFile(join(scratch, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "9.9.9" }));
    await mkdir(join(home, ".claude", "plugins"), { recursive: true });
    await writeFile(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({
      plugins: { "fulcrum@fulcrum": { version: "9.9.9" } },
    }));
    await mkdir(join(home, ".claude", "skills", "fulcrum", "legacy"), { recursive: true });
    await writeFile(join(home, ".claude", "skills", "fulcrum", "legacy", "SKILL.md"), "legacy");
    await mkdir(join(home, ".claude", "plugins", "cache", "fulcrum", "stale-source"), { recursive: true });
    await writeFile(join(home, ".claude", "plugins", "cache", "fulcrum", "stale-source", "old.original.md"), "old");

    const logs = await captureLogs(() => syncSkills({ agents: ["claude-code"] }));

    const cacheSkill = join(home, ".claude", "plugins", "cache", "fulcrum", "fulcrum", "9.9.9", "skills", "tool-a", "SKILL.md");
    const marketplaceSkill = join(home, ".claude", "plugins", "marketplaces", "fulcrum", "plugins", "fulcrum", "skills", "tool-b", "SKILL.md");
    expect(await readFile(cacheSkill, "utf8")).toContain("Tool A handles project-scoped sync.");
    expect(await readFile(marketplaceSkill, "utf8")).toContain("Tool B handles metadata listing.");
    expect(await exists(join(home, ".claude", "skills", "fulcrum"))).toBe(false);
    expect(logs.join("\n")).toContain("fulcrum@fulcrum already installed");
    expect(logs.join("\n")).toContain("removed legacy layout");
  });

  it("removes authored Claude plugin caches only after Fulcrum ownership is proven", async () => {
    const home = process.env["HOME"]!;
    const cacheRoot = join(home, ".claude", "plugins", "cache", "fulcrum");
    const marketplaceRoot = join(home, ".claude", "plugins", "marketplaces", "fulcrum");
    await mkdir(join(home, ".claude", "plugins"), { recursive: true });
    await mkdir(cacheRoot, { recursive: true });
    await mkdir(marketplaceRoot, { recursive: true });
    await writeFile(join(cacheRoot, "owned.txt"), "owned cache");
    await writeFile(join(marketplaceRoot, "owned.txt"), "owned marketplace");

    const unownedLogs = await captureLogs(() => removeAuthoredSkills({ agents: ["claude-code"] }));
    expect(unownedLogs.join("\n")).toContain("not-owned-by-fulcrum");
    expect(await readFile(join(cacheRoot, "owned.txt"), "utf8")).toBe("owned cache");
    expect(await readFile(join(marketplaceRoot, "owned.txt"), "utf8")).toBe("owned marketplace");

    await writeMarker({
      plugin: "fulcrum@fulcrum",
      marketplace: "moabualruz/fulcrum",
      source: "test",
      operation: "install",
    });
    const ownedLogs = await captureLogs(() => removeAuthoredSkills({ agents: ["claude-code"] }));

    expect(ownedLogs.join("\n")).toContain("removed plugin cache");
    expect(ownedLogs.join("\n")).toContain("removed marketplace cache");
    expect(await exists(cacheRoot)).toBe(false);
    expect(await exists(marketplaceRoot)).toBe(false);
  });

  it("reports malformed eval files and command argument failures", async () => {
    await writeFile(join(scratch, "evals", "tool-b.json"), "{not-json");
    const listed = await captureLogs(() => run(["list"]));
    expect(listed.join("\n")).toContain("tool-b");
    expect(listed.join("\n")).toContain("0 eval entries");

    const originalExit = process.exit;
    const exits: number[] = [];
    process.exit = ((code?: string | number | null) => {
      const exitCode = typeof code === "number" ? code : 0;
      exits.push(exitCode);
      throw new Error(`exit ${exitCode}`);
    }) as typeof process.exit;
    try {
      await expect(captureLogs(() => run(["sync", "--codex-scope", "bad"]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["sync", "--unknown"]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["list", "--bad"]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["lint"]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["lint", join(scratch, "missing")]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["upstream", "--bad"]))).rejects.toThrow("exit 2");
      await expect(captureLogs(() => run(["nope"]))).rejects.toThrow("exit 2");
    } finally {
      process.exit = originalExit;
    }
    expect(exits).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });
});
