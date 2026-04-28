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

  await mkdir(join(TMP, ".claude"), { recursive: true });
  await mkdir(join(TMP, ".codex"), { recursive: true });
  await mkdir(join(TMP, ".gemini"), { recursive: true });
  await mkdir(join(TMP, ".config", "opencode", "plugins"), { recursive: true });
  await mkdir(join(TMP, ".pi", "agent", "extensions"), { recursive: true });
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

describe("fulcrum hooks enable/disable", () => {
  test("enable and disable index-check across all agent configs", async () => {
    await run(["enable", "index-check"]);

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

    await run(["disable", "index-check"]);

    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled", "index-check")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "hooks.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(openCodePath).exists()).toBe(false);
    expect(await Bun.file(piPath).exists()).toBe(false);
  });

  test("format preserves unrelated Claude settings and removes only its own entry", async () => {
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

    await run(["enable", "format"]);

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

    await run(["disable", "format"]);

    const disabled = JSON.parse(await readFile(claudePath, "utf8"));
    expect(disabled.theme).toBe("dark");
    expect(disabled.hooks.PostToolUse).toHaveLength(1);
    expect(disabled.hooks.PostToolUse[0]).toMatchObject({
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "user command" }],
    });
  });
});
