import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Read SKILL.md content for a given skill slug.
 * Returns file content or null if slug/file missing (logs warning).
 */
export async function readSkillContent(
  slug: string,
  _orgId: string,
  repoRoot: string,
): Promise<string | null> {
  const skillPath = join(repoRoot, "skills", slug, "SKILL.md");
  try {
    await stat(skillPath);
  } catch {
    console.warn(`[skills/loader] skill slug "${slug}" not found at ${skillPath}`);
    return null;
  }
  try {
    return await readFile(skillPath, "utf-8");
  } catch {
    console.warn(`[skills/loader] failed to read SKILL.md for slug "${slug}"`);
    return null;
  }
}
