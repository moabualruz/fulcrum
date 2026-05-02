/**
 * skills.lock.json schema and helpers.
 *
 * Default path: `${FULCRUM_HOME}/skills.lock.json`, falling back to
 * `~/.fulcrum/skills.lock.json`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

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
