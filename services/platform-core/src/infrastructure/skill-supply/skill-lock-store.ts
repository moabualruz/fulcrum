import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  readSkillsLockFile,
  writeSkillsLockFile,
  type SkillsLockEntry,
  type SkillsLockFile,
} from "@platform-core/application/skill-supply/lock.ts";
import { sha256Hex } from "@platform-core/application/skill-supply/mcp-virtual-skills.ts";

export interface SkillLockStoreOptions {
  fulcrumHome?: string;
}

export interface SkillSupplyRow {
  id: string;
  name: string;
  slug: string;
  source: "local";
  upstreamRepo: string | null;
  upstreamRef: string | null;
  version: string;
  hash: string;
  installedAt: string;
  enabledAgents: string[];
}

export interface SkillSupplyConflictRow {
  id: string;
  slug: string;
  kind: "lock";
  status: "open";
  localHash: string;
  upstreamHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillSupplySyncResult {
  merged: string[];
  conflicts: string[];
  errors: string[];
}

export class SkillSupplyNotFoundError extends Error {}

export class SkillLockStore {
  constructor(private readonly options: SkillLockStoreOptions = {}) {}

  async list(): Promise<SkillSupplyRow[]> {
    return this.rowsFromLock(await this.readLock());
  }

  async registryList(): Promise<SkillSupplyRow[]> {
    return await this.list();
  }

  async install(input: { path: string }): Promise<SkillSupplyRow> {
    const source = await readSkillSource(input.path);
    const slug = normalizeSlug(source.name ?? source.slug);
    const lock = await this.readLock();
    const entry: SkillsLockEntry = {
      version: source.version,
      hash: sha256Hex(source.content),
      installedAt: new Date().toISOString(),
      enabled_agents: lock[slug]?.enabled_agents ?? ["claude", "codex", "gemini", "opencode", "pi"],
    };
    lock[slug] = entry;
    await this.writeLock(lock);
    return rowFromEntry(slug, entry);
  }

  async upgrade(input: { slug: string }): Promise<SkillSupplyRow[]> {
    const rows = await this.list();
    if (input.slug === "all") return rows;
    const row = rows.find((candidate) => candidate.slug === input.slug);
    if (!row) throw new SkillSupplyNotFoundError(`Skill ${input.slug} not found`);
    return [row];
  }

  async uninstall(input: { slug: string }): Promise<{ ok: true; slug: string }> {
    const lock = await this.readLock();
    if (!lock[input.slug]) throw new SkillSupplyNotFoundError(`Skill ${input.slug} not found`);
    delete lock[input.slug];
    await this.writeLock(lock);
    return { ok: true, slug: input.slug };
  }

  async sync(input: { fetchUpstream?: boolean } = {}): Promise<SkillSupplySyncResult> {
    const conflicts = (await this.listConflicts()).map((conflict) => conflict.slug);
    return {
      merged: [],
      conflicts,
      errors: input.fetchUpstream ? ["Upstream skill fetch is pending the TypeORM skill-supply service migration."] : [],
    };
  }

  async resolveConflict(input: {
    slug: string;
    resolution: "local" | "upstream" | "editor";
  }): Promise<SkillSupplyRow> {
    const lock = await this.readLock();
    const entry = lock[input.slug];
    if (!entry) throw new SkillSupplyNotFoundError(`Skill ${input.slug} not found`);
    const upstreamHash = entry.upstream_conflict;
    const resolvedEntry: SkillsLockEntry = {
      version: entry.version,
      hash: input.resolution === "upstream" && upstreamHash ? upstreamHash : entry.hash,
      installedAt: new Date().toISOString(),
      enabled_agents: entry.enabled_agents,
    };
    lock[input.slug] = resolvedEntry;
    await this.writeLock(lock);
    return rowFromEntry(input.slug, resolvedEntry);
  }

  async listConflicts(): Promise<SkillSupplyConflictRow[]> {
    const lock = await this.readLock();
    return Object.entries(lock)
      .filter(([, entry]) => Boolean(entry.upstream_conflict))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slug, entry]) => ({
        id: slug,
        slug,
        kind: "lock",
        status: "open",
        localHash: entry.hash,
        upstreamHash: entry.upstream_conflict!,
        createdAt: entry.installedAt,
        updatedAt: entry.installedAt,
      }));
  }

  async overrideConflict(input: {
    conflictId: string;
    resolution: "local" | "upstream";
    auditNote?: string;
  }): Promise<{ ok: true }> {
    const slug = input.conflictId.startsWith("skill:") ? input.conflictId.slice("skill:".length) : input.conflictId;
    await this.resolveConflict({ slug, resolution: input.resolution });
    return { ok: true };
  }

  async overrideLock(input: {
    slug: string;
    expectedSha256: string;
    actualSha256: string;
    auditNote?: string;
  }): Promise<{ ok: true }> {
    const lock = await this.readLock();
    const existing = lock[input.slug] ?? {
      version: "0.0.0",
      hash: input.expectedSha256,
      installedAt: new Date().toISOString(),
      enabled_agents: [],
    };
    lock[input.slug] = {
      version: existing.version,
      hash: input.actualSha256,
      installedAt: new Date().toISOString(),
      enabled_agents: existing.enabled_agents,
    };
    await this.writeLock(lock);
    return { ok: true };
  }

  private async readLock(): Promise<SkillsLockFile> {
    return await readSkillsLockFile(this.options);
  }

  private async writeLock(lock: SkillsLockFile): Promise<void> {
    await writeSkillsLockFile(lock, this.options);
  }

  private rowsFromLock(lock: SkillsLockFile): SkillSupplyRow[] {
    return Object.entries(lock)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slug, entry]) => rowFromEntry(slug, entry));
  }
}

function rowFromEntry(slug: string, entry: SkillsLockEntry): SkillSupplyRow {
  return {
    id: slug,
    name: slug,
    slug,
    source: "local",
    upstreamRepo: null,
    upstreamRef: null,
    version: entry.version,
    hash: entry.hash,
    installedAt: entry.installedAt,
    enabledAgents: entry.enabled_agents,
  };
}

async function readSkillSource(inputPath: string): Promise<{ slug: string; name: string | null; version: string; content: string }> {
  const filePath = (await stat(inputPath)).isDirectory() ? join(inputPath, "SKILL.md") : inputPath;
  const content = await readFile(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  return {
    slug: normalizeSlug(frontmatter.name ?? basename(inputPath).replace(/\.[^.]+$/, "")),
    name: frontmatter.name ?? null,
    version: frontmatter.version ?? "0.0.0",
    content,
  };
}

function parseFrontmatter(content: string): { name?: string; version?: string } {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = content.slice(3, end);
  const name = readFrontmatterValue(block, "name");
  const version = readFrontmatterValue(block, "version");
  return { name, version };
}

function readFrontmatterValue(block: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m");
  return pattern.exec(block)?.[1]?.trim();
}

function normalizeSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new Error("Skill slug is required.");
  return slug;
}
