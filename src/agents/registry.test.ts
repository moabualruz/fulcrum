// Tests for the agent registry — ensures structural invariants and that every
// getter returns a non-empty string for a fake $HOME.

import { describe, expect, test } from "bun:test";
import { AGENTS } from "./registry.ts";

const FAKE_HOME = "/home/testuser";

const EXPECTED_IDS = ["claude-code", "codex", "gemini", "opencode", "pi"] as const;

// ---------------------------------------------------------------------------
// 1. All 5 agents present, IDs unique
// ---------------------------------------------------------------------------

describe("AGENTS registry — presence and uniqueness", () => {
  test("exactly 5 agents", () => {
    expect(AGENTS.length).toBe(5);
  });

  test("all expected IDs present", () => {
    const ids = AGENTS.map((a) => a.id);
    for (const id of EXPECTED_IDS) {
      expect(ids).toContain(id);
    }
  });

  test("IDs are unique", () => {
    const ids = AGENTS.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Every getter returns a non-empty string under a fake $HOME
// ---------------------------------------------------------------------------

describe("AGENTS registry — getters return non-empty strings", () => {
  for (const agent of AGENTS) {
    describe(`agent: ${agent.id}`, () => {
      test("baseDir is non-empty", () => {
        const v = agent.baseDir(FAKE_HOME);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      });

      test("rulesFile is non-empty", () => {
        const v = agent.rulesFile(FAKE_HOME);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      });

      test("skillsDir is non-empty", () => {
        const v = agent.skillsDir(FAKE_HOME);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      });

      test("cavemanInstallDir is non-empty", () => {
        const v = agent.cavemanInstallDir(FAKE_HOME);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      });

      if (agent.settingsPath) {
        test("settingsPath is non-empty (when defined)", () => {
          const v = agent.settingsPath!(FAKE_HOME);
          expect(typeof v).toBe("string");
          expect(v.length).toBeGreaterThan(0);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Specific path expectations for known agents
// ---------------------------------------------------------------------------

describe("AGENTS registry — specific path expectations", () => {
  const home = FAKE_HOME;

  test("Claude Code: rulesFile = ~/.claude/CLAUDE.md", () => {
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    expect(claude.rulesFile(home)).toBe(`${home}/.claude/CLAUDE.md`);
  });

  test("Claude Code: skillsDir = ~/.claude/skills", () => {
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    expect(claude.skillsDir(home)).toBe(`${home}/.claude/skills`);
  });

  test("Claude Code: cavemanInstallDir = ~/.claude/plugins/cache/caveman/caveman", () => {
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    expect(claude.cavemanInstallDir(home)).toBe(`${home}/.claude/plugins/cache/caveman/caveman`);
  });

  test("Claude Code: settingsPath = ~/.claude/settings.json", () => {
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    expect(claude.settingsPath!(home)).toBe(`${home}/.claude/settings.json`);
  });

  test("Gemini: rulesFile = ~/AGENTS.md (the @-import target)", () => {
    const gemini = AGENTS.find((a) => a.id === "gemini")!;
    expect(gemini.rulesFile(home)).toBe(`${home}/AGENTS.md`);
  });

  test("Gemini: skillsDir = ~/.gemini/extensions/fulcrum-skills/skills", () => {
    const gemini = AGENTS.find((a) => a.id === "gemini")!;
    expect(gemini.skillsDir(home)).toBe(`${home}/.gemini/extensions/fulcrum-skills/skills`);
  });

  test("Gemini: cavemanInstallDir = ~/.gemini/extensions/caveman", () => {
    const gemini = AGENTS.find((a) => a.id === "gemini")!;
    expect(gemini.cavemanInstallDir(home)).toBe(`${home}/.gemini/extensions/caveman`);
  });

  test("Codex: rulesFile = ~/.codex/AGENTS.md", () => {
    const codex = AGENTS.find((a) => a.id === "codex")!;
    expect(codex.rulesFile(home)).toBe(`${home}/.codex/AGENTS.md`);
  });

  test("OpenCode: rulesFile = ~/.config/opencode/AGENTS.md", () => {
    const opencode = AGENTS.find((a) => a.id === "opencode")!;
    expect(opencode.rulesFile(home)).toBe(`${home}/.config/opencode/AGENTS.md`);
  });

  test("Pi CLI: rulesFile = ~/.pi/agent/AGENTS.md", () => {
    const pi = AGENTS.find((a) => a.id === "pi")!;
    expect(pi.rulesFile(home)).toBe(`${home}/.pi/agent/AGENTS.md`);
  });

  test("Codex: does not have settingsPath", () => {
    const codex = AGENTS.find((a) => a.id === "codex")!;
    expect(codex.settingsPath).toBeUndefined();
  });

  test("Gemini: does not have settingsPath", () => {
    const gemini = AGENTS.find((a) => a.id === "gemini")!;
    expect(gemini.settingsPath).toBeUndefined();
  });
});
