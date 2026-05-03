import { readSkillContent } from "../skills/loader.ts";

export interface ContextSection {
  heading: string;
  body: string;
}

export interface SkillContextBundle {
  sections: ContextSection[];
  rendered: string;
  truncated: boolean;
}

export interface AssembleSkillContextInput {
  skillSlugs: string[];
  orgId: string;
  repoRoot: string;
  /** Approximate token budget for skill content. ~4 chars/token. */
  tokenBudget?: number;
}

const CHARS_PER_TOKEN = 4;

/**
 * Assemble skill SKILL.md content into context sections.
 * Missing slugs log warning and are skipped.
 * Token budget truncates skills proportionally.
 */
export async function assembleSkillContext(
  input: AssembleSkillContextInput,
): Promise<SkillContextBundle> {
  if (input.skillSlugs.length === 0) {
    return { sections: [], rendered: "", truncated: false };
  }

  const sections: ContextSection[] = [];
  for (const slug of input.skillSlugs) {
    const content = await readSkillContent(slug, input.orgId, input.repoRoot);
    if (content !== null) {
      sections.push({ heading: `Skill: ${slug}`, body: content });
    }
  }

  let truncated = false;

  if (input.tokenBudget != null && sections.length > 0) {
    const charBudget = input.tokenBudget * CHARS_PER_TOKEN;
    const totalChars = sections.reduce((sum, s) => sum + s.heading.length + s.body.length + 6, 0);

    if (totalChars > charBudget) {
      truncated = true;
      const ratio = charBudget / totalChars;
      for (const section of sections) {
        const maxBody = Math.max(0, Math.floor(section.body.length * ratio));
        if (section.body.length > maxBody) {
          section.body = section.body.slice(0, maxBody) + "\n…[truncated]";
        }
      }
    }
  }

  const rendered = sections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join("\n\n");

  return { sections, rendered, truncated };
}
