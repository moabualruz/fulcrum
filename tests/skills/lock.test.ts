/**
 * TDD — skills.lock.json schema + round-trip helpers.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md
 */

import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  readSkillsLockFile,
  skillsLockPath,
  SkillsLockFile,
  writeSkillsLockFile,
  type SkillsLockFile as SkillsLockFileType,
} from "../../src/skills/lock.ts";

let scratch: string | undefined;

afterEach(async () => {
  if (scratch !== undefined) {
    await rm(scratch, { recursive: true, force: true });
    scratch = undefined;
  }
});

async function tempFulcrumHome(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skills-lock-"));
  return join(scratch, ".fulcrum");
}

describe("SkillsLockFile schema", () => {
  it("parses valid lock data", () => {
    const data: SkillsLockFileType = {
      tdd: {
        version: "1.2.3",
        hash: "sha256:abc123",
        installedAt: "2026-05-02T12:00:00.000Z",
        upstream_conflict: "--- local\n+++ upstream\n",
        enabled_agents: ["codex", "claude-code"],
      },
    };

    expect(SkillsLockFile.parse(data)).toEqual(data);
  });

  it("rejects invalid lock entries", () => {
    expect(() =>
      SkillsLockFile.parse({
        tdd: {
          version: "1.2.3",
          hash: "sha256:abc123",
          installedAt: "not-a-date",
          enabled_agents: "codex",
        },
      }),
    ).toThrow();
  });
});

describe("skills.lock.json helpers", () => {
  it("writes human-readable JSON and reads back the same object", async () => {
    const fulcrumHome = await tempFulcrumHome();
    const lock: SkillsLockFileType = {
      "test-driven-development": {
        version: "0.1.0",
        hash: "sha256:4f88",
        installedAt: "2026-05-02T12:00:00.000Z",
        enabled_agents: ["codex"],
      },
    };

    await writeSkillsLockFile(lock, { fulcrumHome });
    const loaded = await readSkillsLockFile({ fulcrumHome });

    expect(loaded).toEqual(lock);

    const text = await readFile(skillsLockPath({ fulcrumHome }), "utf8");
    expect(text).toBe(`${JSON.stringify(lock, null, 2)}\n`);
  });

  it("rejects invalid JSON already on disk", async () => {
    const fulcrumHome = await tempFulcrumHome();
    await mkdir(dirname(skillsLockPath({ fulcrumHome })), { recursive: true });
    await writeFile(
      skillsLockPath({ fulcrumHome }),
      JSON.stringify({ tdd: { version: "1" } }, null, 2),
    );

    await expect(readSkillsLockFile({ fulcrumHome })).rejects.toThrow();
  });
});
