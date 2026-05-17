/**
 * skills.lock.json schema and helpers.
 *
 * Default path: `${FULCRUM_HOME}/skills.lock.json`, falling back to
 * `~/.fulcrum/skills.lock.json`.
 *
 * D-21: SHA mismatch fails closed per skill with exact expected/actual SHA.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "./mcp-virtual-skills.ts";

export const SkillsLockEntry = z.object({
  version: z.string().min(1),
  hash: z.string().min(1),
  installedAt: z.string().datetime({ offset: true }),
  upstream_conflict: z.string().optional(),
  enabled_agents: z.array(z.string().min(1)),
});

export const SkillsLockFile = z.record(z.string().min(1), SkillsLockEntry);

export type SkillsLockEntry = z.infer<typeof SkillsLockEntry>;
export type SkillsLockFile = z.infer<typeof SkillsLockFile>;

export interface SkillsLockPathOptions {
  fulcrumHome?: string;
}

function defaultFulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

export function skillsLockPath(options: SkillsLockPathOptions = {}): string {
  return join(options.fulcrumHome ?? defaultFulcrumHome(), "skills.lock.json");
}

export async function readSkillsLockFile(
  options: SkillsLockPathOptions = {},
): Promise<SkillsLockFile> {
  const path = skillsLockPath(options);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return {};
    throw error;
  }

  return SkillsLockFile.parse(JSON.parse(raw));
}

export async function writeSkillsLockFile(
  lock: SkillsLockFile,
  options: SkillsLockPathOptions = {},
): Promise<void> {
  const path = skillsLockPath(options);
  const parsed = SkillsLockFile.parse(lock);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

// ── Lock enforcement (D-21) ────────────────────────────────────────────

export interface LockVerificationResult {
  slug: string;
  status: "ok" | "sha_mismatch" | "missing" | "error";
  available: boolean;
  expectedSha256: string;
  actualSha256: string | null;
  reason: string | null;
}

/**
 * Verify that a skill's installed content matches the expected SHA-256 hash.
 *
 * Returns per-skill state with exact expected/actual values.
 * When hashes don't match, the skill is marked unavailable (available: false)
 * and the caller must resolve the mismatch before the skill can be used.
 */
export function verifySkillLock(
  slug: string,
  expectedSha256: string,
  actualContent: string | null,
): LockVerificationResult {
  if (actualContent === null) {
    return {
      slug,
      status: "missing",
      available: false,
      expectedSha256,
      actualSha256: null,
      reason: `skill "${slug}" has no installed content`,
    };
  }

  const actualSha256 = sha256Hex(actualContent);
  const matches = actualSha256 === expectedSha256;

  return {
    slug,
    status: matches ? "ok" : "sha_mismatch",
    available: matches,
    expectedSha256,
    actualSha256,
    reason: matches
      ? null
      : `SHA mismatch for "${slug}": expected ${expectedSha256}, got ${actualSha256}`,
  };
}
