import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run, setDryRun } from "../../apps/cli/src/init.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;
let previousPath: string | undefined;
let previousCwd: string;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function capture(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines.join("\n");
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-init-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  previousPath = process.env["PATH"];
  previousCwd = process.cwd();
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  process.env["PATH"] = join(scratch, "bin");
  await mkdir(process.env["HOME"], { recursive: true });
  await mkdir(process.env["PATH"], { recursive: true });
});

afterEach(async () => {
  setDryRun(false);
  process.chdir(previousCwd);
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  await rm(scratch, { recursive: true, force: true });
});

describe("fulcrum init source behavior", () => {
  it("prints command help with optional DIR argument", async () => {
    const output = await capture(() => run(["--help"]));

    expect(output).toContain("fulcrum init [DIR]");
    expect(output).toContain("fulcrum init --dry-run [DIR]");
  });

  it("bootstraps project rules, Claude import, Gemini shim, gitignore, vendors, and index dry-run", async () => {
    const project = join(scratch, "project");
    await mkdir(join(project, ".gemini"), { recursive: true });
    await writeFile(join(project, ".gitignore"), "node_modules\n");

    const output = await capture(() => run(["--dry-run", project]));

    expect(output).toContain("(dry-run mode");
    expect(output).toContain("fulcrum init");
    expect(output).toContain("would write:");
    expect(output).toContain("Vendor integrations:");
    expect(output).toContain("Project indices:");
    expect(await exists(join(project, "AGENTS.md"))).toBe(false);
    expect(await readFile(join(project, ".gitignore"), "utf8")).toBe("node_modules\n");
  });

  it("writes project files idempotently when not dry-run", async () => {
    const project = join(scratch, "project");
    await mkdir(join(project, ".gemini"), { recursive: true });
    await writeFile(join(project, "AGENTS.md"), "# Existing\n");
    await writeFile(join(project, ".gitignore"), ".claude/settings.local.json\n");

    const output = await capture(() => run([project]));

    expect(output).toContain("AGENTS.md  (kept)");
    expect(output).toContain(".claude/CLAUDE.md");
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe("# Existing\n");
    expect(await readFile(join(project, ".claude", "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(await readFile(join(project, "GEMINI.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(await readFile(join(project, ".claude", "skills", ".gitkeep"), "utf8")).toBe("");
    const gitignore = await readFile(join(project, ".gitignore"), "utf8");
    expect(gitignore.match(/\.claude\/settings\.local\.json/g)).toHaveLength(1);
    expect(gitignore).toContain(".claude/.cache/");
  });

  it("handles default cwd target and missing directory errors", async () => {
    const project = join(scratch, "cwd-project");
    await mkdir(project, { recursive: true });
    process.chdir(project);

    const cwdOutput = await capture(() => run(["--dry-run"]));
    expect(cwdOutput).toContain(project);

    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;
    try {
      await expect(capture(() => run([join(scratch, "missing")]))).rejects.toThrow("process.exit(1)");
    } finally {
      process.exit = originalExit;
    }
  });

  it("routes init reindex to project index and rejects missing reindex target", async () => {
    const project = join(scratch, "project");
    await mkdir(project, { recursive: true });

    const output = await capture(() => run(["reindex", "--dry-run", project]));
    expect(output).toContain("fulcrum init reindex");
    expect(output).toContain("Project indices:");

    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;
    try {
      await expect(capture(() => run(["reindex", join(scratch, "missing")]))).rejects.toThrow("process.exit(1)");
    } finally {
      process.exit = originalExit;
    }
  });
});
