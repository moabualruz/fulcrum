import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { AGENTS } from "../agents/registry.ts";

export const SKILL_DESCRIPTION_WARNING_THRESHOLD = 8_000;

export interface SkillBudgetEntry {
  name: string;
  path: string;
  descriptionChars: number;
  sourceRoot: string;
}

export interface SkillBudgetRoot {
  path: string;
  skills: number;
  descriptionChars: number;
}

export interface SkillBudgetDuplicate {
  name: string;
  count: number;
  paths: string[];
}

export interface AgentSkillBudget {
  id: string;
  label: string;
  activeSkillCount: number;
  totalDescriptionChars: number;
  warningThresholdChars: number;
  overThreshold: boolean;
  sourceRoots: SkillBudgetRoot[];
  topDescriptions: SkillBudgetEntry[];
  duplicateNames: SkillBudgetDuplicate[];
}

export interface SkillBudgetReport {
  warningThresholdChars: number;
  agents: AgentSkillBudget[];
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

function skipDir(name: string): boolean {
  return (
    name === ".git" ||
    name === "node_modules" ||
    name === "_archive" ||
    name === "_template" ||
    name === "worktrees"
  );
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!km) continue;
    let value = (km[2] ?? "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[km[1]!] = value;
  }
  return out;
}

async function walkSkillFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skipDir(entry.name)) continue;
        await walk(`${dir}/${entry.name}`);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(`${dir}/${entry.name}`);
      }
    }
  }

  await walk(root);
  return files;
}

function skillRoots(home: string, agentId: string): string[] {
  const agent = AGENTS.find((candidate) => candidate.id === agentId);
  if (!agent) return [];
  switch (agentId) {
    case "claude-code":
      return [`${home}/.claude/skills`, `${home}/.claude/plugins/cache`];
    case "codex":
      return [`${home}/.codex/skills`, `${home}/.codex/plugins/cache`];
    case "gemini":
      return [`${home}/.gemini/extensions`, `${home}/.gemini/skills`];
    case "opencode":
    case "pi":
      return [agent.skillsDir(home)];
    default:
      return [agent.skillsDir(home)];
  }
}

async function entriesForRoot(root: string): Promise<SkillBudgetEntry[]> {
  const entries: SkillBudgetEntry[] = [];
  for (const file of await walkSkillFiles(root)) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text);
    const name = fm["name"] || basename(dirname(file));
    const description = fm["description"] ?? "";
    entries.push({
      name,
      path: file,
      descriptionChars: description.length,
      sourceRoot: root,
    });
  }
  return entries;
}

export async function scanSkillBudgets(home: string): Promise<SkillBudgetReport> {
  const agents: AgentSkillBudget[] = [];

  for (const agent of AGENTS) {
    const roots = skillRoots(home, agent.id);
    const entriesByRoot = new Map<string, SkillBudgetEntry[]>();
    for (const root of roots) {
      const entries = await entriesForRoot(root);
      if (entries.length > 0 || await exists(root)) {
        entriesByRoot.set(root, entries);
      }
    }

    const entries = [...entriesByRoot.values()].flat();
    const byName = new Map<string, SkillBudgetEntry[]>();
    for (const entry of entries) {
      const current = byName.get(entry.name) ?? [];
      current.push(entry);
      byName.set(entry.name, current);
    }

    const totalDescriptionChars = entries.reduce((sum, entry) => sum + entry.descriptionChars, 0);
    agents.push({
      id: agent.id,
      label: agent.label,
      activeSkillCount: entries.length,
      totalDescriptionChars,
      warningThresholdChars: SKILL_DESCRIPTION_WARNING_THRESHOLD,
      overThreshold: totalDescriptionChars > SKILL_DESCRIPTION_WARNING_THRESHOLD,
      sourceRoots: [...entriesByRoot.entries()].map(([path, rootEntries]) => ({
        path,
        skills: rootEntries.length,
        descriptionChars: rootEntries.reduce((sum, entry) => sum + entry.descriptionChars, 0),
      })),
      topDescriptions: [...entries]
        .sort((a, b) => b.descriptionChars - a.descriptionChars || a.name.localeCompare(b.name))
        .slice(0, 5),
      duplicateNames: [...byName.entries()]
        .filter(([, grouped]) => grouped.length > 1)
        .map(([name, grouped]) => ({
          name,
          count: grouped.length,
          paths: grouped.map((entry) => entry.path).sort(),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    });
  }

  return {
    warningThresholdChars: SKILL_DESCRIPTION_WARNING_THRESHOLD,
    agents,
  };
}
