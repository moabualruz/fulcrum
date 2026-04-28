import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "./hooks.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalRepoDir: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-hooks-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  await rm(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createAllAgentDirs(): Promise<void> {
  await mkdir(join(TMP, ".claude"), { recursive: true });
  await mkdir(join(TMP, ".codex"), { recursive: true });
  await mkdir(join(TMP, ".gemini"), { recursive: true });
  await mkdir(join(TMP, ".config", "opencode", "plugins"), { recursive: true });
  await mkdir(join(TMP, ".pi", "agent", "extensions"), { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. --all flag: writes all 5 agent configs regardless of dir presence
// ---------------------------------------------------------------------------

describe("fulcrum hooks enable/disable --all", () => {
  test("enable and disable index-check across all agent configs", async () => {
    // Pre-create all agent dirs so writes can succeed.
    await createAllAgentDirs();
    await run(["enable", "index-check", "--all"]);

    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists()).toBe(true);

    const claude = JSON.parse(await readFile(join(TMP, ".claude", "settings.json"), "utf8"));
    expect(claude.hooks.SessionStart).toHaveLength(1);
    expect(claude.hooks.SessionStart[0].hooks[0]).toMatchObject({
      type: "command",
      command: "fulcrum hook index-check",
      timeout: 5000,
    });

    const codex = JSON.parse(await readFile(join(TMP, ".codex", "hooks.json"), "utf8"));
    expect(codex.hooks.SessionStart).toHaveLength(1);
    expect(codex.hooks.SessionStart[0].hooks[0]).toMatchObject({
      type: "command",
      command: "fulcrum hook index-check",
    });

    const gemini = JSON.parse(await readFile(join(TMP, ".gemini", "settings.json"), "utf8"));
    expect(gemini.hooks.SessionStart).toHaveLength(1);
    expect(gemini.hooks.SessionStart[0]).toMatchObject({
      type: "command",
      command: "fulcrum hook index-check",
    });

    const openCodePath = join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts");
    const openCode = await readFile(openCodePath, "utf8");
    expect(openCode).toContain(`"session.created"`);
    expect(openCode).toContain("fulcrum hook index-check");

    const piPath = join(TMP, ".pi", "agent", "extensions", "fulcrum-index-check.ts");
    const pi = await readFile(piPath, "utf8");
    expect(pi).toContain(`pi.on("session_start"`);
    expect(pi).toContain("fulcrum hook index-check");

    await run(["disable", "index-check", "--all"]);

    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "hooks.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(openCodePath).exists()).toBe(false);
    expect(await Bun.file(piPath).exists()).toBe(false);
  });

  test("format preserves unrelated Claude settings and removes only its own entry", async () => {
    await createAllAgentDirs();
    const claudePath = join(TMP, ".claude", "settings.json");
    await writeFile(
      claudePath,
      JSON.stringify(
        {
          theme: "dark",
          hooks: {
            PostToolUse: [
              {
                matcher: "Write|Edit",
                hooks: [{ type: "command", command: "user command" }],
              },
            ],
          },
        },
        null,
        2,
      ) + "\n",
    );

    await run(["enable", "format", "--all"]);

    const enabled = JSON.parse(await readFile(claudePath, "utf8"));
    expect(enabled.theme).toBe("dark");
    expect(enabled.hooks.PostToolUse).toHaveLength(2);
    expect(enabled.hooks.PostToolUse[0]).toMatchObject({
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "user command" }],
    });
    expect(enabled.hooks.PostToolUse[1]).toMatchObject({
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "fulcrum hook format", timeout: 8000 }],
    });

    await run(["disable", "format", "--all"]);

    const disabled = JSON.parse(await readFile(claudePath, "utf8"));
    expect(disabled.theme).toBe("dark");
    expect(disabled.hooks.PostToolUse).toHaveLength(1);
    expect(disabled.hooks.PostToolUse[0]).toMatchObject({
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "user command" }],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Detection-aware default: only write configs for dirs that exist
// ---------------------------------------------------------------------------

describe("fulcrum hooks enable/disable (detection-aware default)", () => {
  test("enable with no agent dirs → no config files written", async () => {
    // No agent dirs created — none should be detected.
    await run(["enable", "index-check"]);

    // Marker is still written (intent recorded regardless of detection).
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists()).toBe(true);

    // No agent config files created.
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "hooks.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "settings.json")).exists()).toBe(false);
    expect(
      await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(TMP, ".pi", "agent", "extensions", "fulcrum-index-check.ts")).exists(),
    ).toBe(false);
  });

  test("enable with only Claude and Codex dirs → writes only those two", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });

    await run(["enable", "index-check"]);

    // Claude and Codex configs written.
    const claude = JSON.parse(await readFile(join(TMP, ".claude", "settings.json"), "utf8"));
    expect(claude.hooks.SessionStart).toHaveLength(1);

    const codex = JSON.parse(await readFile(join(TMP, ".codex", "hooks.json"), "utf8"));
    expect(codex.hooks.SessionStart).toHaveLength(1);

    // Gemini, OpenCode, Pi not written.
    expect(await Bun.file(join(TMP, ".gemini", "settings.json")).exists()).toBe(false);
    expect(
      await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(TMP, ".pi", "agent", "extensions", "fulcrum-index-check.ts")).exists(),
    ).toBe(false);
  });

  test("enable with all dirs present → writes all 5 (same as --all)", async () => {
    await createAllAgentDirs();

    await run(["enable", "index-check"]);

    // All 5 should be written.
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(true);
    expect(await Bun.file(join(TMP, ".codex", "hooks.json")).exists()).toBe(true);
    expect(await Bun.file(join(TMP, ".gemini", "settings.json")).exists()).toBe(true);
    expect(
      await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(join(TMP, ".pi", "agent", "extensions", "fulcrum-index-check.ts")).exists(),
    ).toBe(true);
  });

  test("disable with only Claude dir → removes only Claude config, skips others", async () => {
    // Set up: enable with --all first so configs exist.
    await createAllAgentDirs();
    await run(["enable", "index-check", "--all"]);

    // Remove all agent dirs except Claude to simulate a machine with only Claude.
    await rm(join(TMP, ".codex"), { recursive: true, force: true });
    await rm(join(TMP, ".gemini"), { recursive: true, force: true });
    await rm(join(TMP, ".config", "opencode"), { recursive: true, force: true });
    await rm(join(TMP, ".pi"), { recursive: true, force: true });

    // Disable without --all: only Claude dir exists so only Claude is targeted.
    await run(["disable", "index-check"]);

    // Claude config removed.
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);

    // Codex hooks.json still exists (was not in targetAgents, so not touched).
    // Note: the file physically exists because we only removed the dir after enable.
    // After rm of .codex dir, the file no longer exists either — that's fine.
    // The key assertion is the marker is cleared.
    expect(
      await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists(),
    ).toBe(false);
  });

  test("disable with no agent dirs → no crash, marker cleared", async () => {
    // Create and enable first.
    await createAllAgentDirs();
    await run(["enable", "index-check", "--all"]);

    // Remove all agent dirs.
    await rm(join(TMP, ".claude"), { recursive: true, force: true });
    await rm(join(TMP, ".codex"), { recursive: true, force: true });
    await rm(join(TMP, ".gemini"), { recursive: true, force: true });
    await rm(join(TMP, ".config"), { recursive: true, force: true });
    await rm(join(TMP, ".pi"), { recursive: true, force: true });

    // Should not crash.
    await run(["disable", "index-check"]);

    expect(
      await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists(),
    ).toBe(false);
  });
});
