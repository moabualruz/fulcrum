import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeExactLine, removeSentinelBlock, run, setDryRun } from "./uninstall.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalRepoDir: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-uninstall-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = TMP;
  setDryRun(false);
});

afterEach(async () => {
  setDryRun(false);
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  await rm(TMP, { recursive: true, force: true });
});

describe("removeSentinelBlock", () => {
  test("removes only Fulcrum rules block and preserves user content", async () => {
    const file = join(TMP, "AGENTS.md");
    await writeFile(
      file,
      [
        "# User rules",
        "",
        "<!-- BEGIN FULCRUM RULES -->",
        "managed",
        "<!-- END FULCRUM RULES -->",
        "",
        "Keep me",
        "",
      ].join("\n"),
    );

    await removeSentinelBlock(file, "Test");

    expect(await readFile(file, "utf8")).toBe("# User rules\n\nKeep me\n");
  });

  test("refuses mismatched markers", async () => {
    const file = join(TMP, "bad.md");
    await writeFile(file, "<!-- BEGIN FULCRUM RULES -->\nmanaged\n");

    await removeSentinelBlock(file, "Bad");

    expect(await readFile(file, "utf8")).toBe("<!-- BEGIN FULCRUM RULES -->\nmanaged\n");
  });
});

describe("removeExactLine", () => {
  test("removes only the generated Gemini import line", async () => {
    const file = join(TMP, "GEMINI.md");
    await writeFile(file, "before\n@AGENTS.md\nafter\n");

    await removeExactLine(file, "@AGENTS.md", "Gemini import");

    expect(await readFile(file, "utf8")).toBe("before\nafter\n");
  });
});

describe("run", () => {
  test("removes managed namespaces, hook state, and unmodified policy", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");

    await mkdir(join(TMP, ".fulcrum", "hooks", "snippets"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "hooks", "enabled"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "default = true\n");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await writeFile(
      join(TMP, ".claude", "settings.json"),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "fulcrum hook index-check" }] }] } }, null, 2) + "\n",
    );
    await mkdir(join(TMP, ".config", "opencode", "plugins"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts"), "managed\n");

    await mkdir(join(TMP, ".codex", "skills", "fulcrum", "jq"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "fulcrum-upstream", "ast-grep"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-skills", "skills", "jq"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills", "skills", "ast-grep"), { recursive: true });
    await writeFile(join(TMP, ".codex", "AGENTS.md"), "user\n<!-- BEGIN FULCRUM RULES -->\nmanaged\n<!-- END FULCRUM RULES -->\n");
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "GEMINI.md"), "@AGENTS.md\n");

    await run([]);

    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum-upstream")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "snippets")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "tool-output-policy.toml")).exists()).toBe(false);
    expect(await readFile(join(TMP, ".codex", "AGENTS.md"), "utf8")).toBe("user\n");
    expect(await readFile(join(TMP, ".gemini", "GEMINI.md"), "utf8")).toBe("");
  });

  test("keeps modified policy without --purge", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "user = true\n");

    await run([]);

    expect(await readFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "utf8")).toBe("user = true\n");
  });
});
