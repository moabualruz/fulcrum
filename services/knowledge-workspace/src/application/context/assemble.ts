import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { ContextSnapshot } from "@knowledge-workspace/infrastructure/database/entities/memory/ContextSnapshot.ts";
import { AgentRunRepository } from "@execution-orchestration/infrastructure/database/repositories/orchestration/AgentRunRepository.ts";
import { DocumentRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocumentRepository.ts";
import { FulcrumSkillRepository } from "@platform-core/infrastructure/application-database/repositories/skills/FulcrumSkillRepository.ts";
import { RepoRepository } from "@integration-hub/infrastructure/database/repositories/repos/RepoRepository.ts";
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { MemoryRetriever } from "@knowledge-workspace/application/memory/retriever.ts";
import { readSkillContent } from "@platform-core/application/skill-supply/loader.ts";

export const DEFAULT_CONTEXT_TOKEN_BUDGET = 8192;

export const CONTEXT_SLICE_WEIGHTS = {
  memories: 0.25,
  linkedDocs: 0.2,
  recentRuns: 0.35,
  repoState: 0.1,
  skillPrompts: 0.1,
} as const;

export type ContextSliceKey = keyof typeof CONTEXT_SLICE_WEIGHTS;

export interface ContextSlice {
  content: string;
  tokenCount: number;
}

export interface ContextBundle {
  taskId: string;
  orgId: string;
  projectId: string | null;
  tokenBudget: number;
  tokenCount: number;
  slices: Record<ContextSliceKey, ContextSlice>;
}

export interface ContextAssembleOptions {
  tokenBudget?: number;
  agent?: string;
  agentType?: string;
  runId?: string;
}

type UnknownRecord = Record<string, unknown>;

interface MemoryRetrieverPort {
  retrieve(query: string, opts: unknown): Promise<unknown[]>;
}

interface FindOneOrFailPort {
  findOneOrFail(...args: unknown[]): Promise<unknown>;
}

interface FindPort {
  find(...args: unknown[]): Promise<unknown[]>;
}

interface FindOnePort {
  findOne(...args: unknown[]): Promise<unknown | null>;
}

interface SnapshotWriterPort {
  write(record: {
    bundleBlob: ContextBundle;
    tokenCount: number;
    sliceSizes: Record<ContextSliceKey, number>;
  }): Promise<string>;
}

const SLICE_KEYS: ContextSliceKey[] = [
  "memories",
  "linkedDocs",
  "recentRuns",
  "repoState",
  "skillPrompts",
];

export function estimateContextTokens(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function replayContextSnapshot(bundleBlob: unknown): ContextBundle {
  return bundleBlob as ContextBundle;
}

@Injectable()
export class ContextAssembler {
  constructor(
    private readonly retriever: MemoryRetrieverPort,
    private readonly taskRepository: FindOneOrFailPort,
    private readonly documentRepository: FindPort,
    private readonly runRepository: FindPort,
    private readonly snapshotWriterOrEm: SnapshotWriterPort | EntityManager,
    private readonly repoRepository: FindOnePort,
    private readonly skillRepository: FindPort,
  ) {}

  async assemble(
    taskId: string,
    options: ContextAssembleOptions = {},
  ): Promise<{ bundle: ContextBundle; snapshotId: string }> {
    const tokenBudget = options.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
    const task = await this.loadTask(taskId);
    const customFields = recordFrom(await readValue(task, "customFields"));
    const orgId = requireString(readNested(task, ["org", "id"]), "task org id");
    const projectId = stringOrNull(customFields["projectId"] ?? task["projectId"]);
    const title = stringOrNull(customFields["title"] ?? task["title"]) ?? "";
    const description = stringOrNull(customFields["description"] ?? task["description"]) ?? "";
    const query = [title, description].filter((part) => part.trim() !== "").join(" ");

    const allocations = sliceAllocations(tokenBudget);
    const rawSlices: Record<ContextSliceKey, string> = {
      memories: await this.memoriesSlice(query, orgId, projectId),
      linkedDocs: await this.linkedDocsSlice(description, orgId, projectId),
      recentRuns: await this.recentRunsSlice(taskId, task, allocations.recentRuns),
      repoState: await this.repoStateSlice(task, customFields, orgId),
      skillPrompts: await this.skillPromptsSlice(orgId, options.agent ?? options.agentType ?? null),
    };

    const slices: Record<ContextSliceKey, ContextSlice> = {
      memories: makeSlice(rawSlices.memories, allocations.memories),
      repoState: makeSlice(rawSlices.repoState, allocations.repoState),
      linkedDocs: makeSlice(rawSlices.linkedDocs, allocations.linkedDocs),
      recentRuns: makeSlice(rawSlices.recentRuns, allocations.recentRuns),
      skillPrompts: makeSlice(rawSlices.skillPrompts, allocations.skillPrompts),
    };
    const tokenCount = SLICE_KEYS.reduce((sum, key) => sum + slices[key].tokenCount, 0);
    const bundle: ContextBundle = {
      orgId,
      slices,
      taskId,
      projectId,
      tokenCount,
      tokenBudget,
    };

    const snapshotId = await this.writeSnapshot(bundle, options.runId ?? null);
    return { bundle, snapshotId };
  }

  private async loadTask(taskId: string): Promise<UnknownRecord> {
    return recordFrom(await this.taskRepository.findOneOrFail(
      { id: taskId },
      { populate: ["org", "customFields", "sprint", "repo"] },
    ));
  }

  private async memoriesSlice(
    query: string,
    orgId: string,
    projectId: string | null,
  ): Promise<string> {
    const memories = (await this.retriever.retrieve(query, {
      orgId,
      projectId,
      topK: 20,
    })).map(recordFrom);
    return memories.map((memory) => {
      const kind = stringOrNull(memory["kind"]);
      const importance = stringOrNull(memory["importance"]);
      const label = [kind, importance].filter(Boolean).join("/");
      const body = stringOrNull(memory["body"]) ?? "";
      return label === "" ? body : `- ${label}: ${body}`;
    }).join("\n");
  }

  private async linkedDocsSlice(
    description: string,
    orgId: string,
    projectId: string | null,
  ): Promise<string> {
    const titles = wikilinkTitles(description).slice(0, 5);
    if (titles.length === 0) return "";

    const docs = (await this.documentRepository.find(
      {
        org: orgId,
        archived: false,
        ...(projectId ? { $or: [{ projectId }, { scope: "global" }] } : {}),
      },
      { orderBy: { updatedAt: "DESC" } },
    )).map(recordFrom);
    const byTitle = new Map<string, UnknownRecord>();
    for (const doc of docs) {
      const title = docTitle(doc);
      if (title) byTitle.set(title, doc);
    }

    return titles
      .map((title) => byTitle.get(title))
      .filter((doc): doc is UnknownRecord => doc != null)
      .map((doc) => clipToTokenBudget(renderDocSection(doc), 200))
      .join("\n---\n");
  }

  private async recentRunsSlice(
    taskId: string,
    task: UnknownRecord,
    allocation: number,
  ): Promise<string> {
    const sameTask = (await this.runRepository.find(
      { task: { id: taskId } },
      { orderBy: { startedAt: "DESC" }, limit: 3 },
    )).map(recordFrom);
    const sprintId = stringOrNull(await readValue(task, "sprint"));
    const siblingRuns = sprintId
      ? (await this.runRepository.find(
        { task: { sprint: sprintId } },
        { orderBy: { startedAt: "DESC" }, limit: 2 },
      )).map(recordFrom)
      : [];

    const selected = [
      ...sortRunsDesc(sameTask).slice(0, 3),
      ...sortRunsDesc(siblingRuns).filter((run) => stringOrNull(run["taskId"] ?? readNested(run, ["task", "id"])) !== taskId).slice(0, 2),
    ];
    const withoutTranscripts = selected.map((run) => renderRun(run, false)).join("\n\n");
    const withTranscripts = selected.map((run) => renderRun(run, true)).join("\n\n");
    return estimateContextTokens(withTranscripts) <= allocation ? withTranscripts : withoutTranscripts;
  }

  private async repoStateSlice(
    task: UnknownRecord,
    customFields: UnknownRecord,
    orgId: string,
  ): Promise<string> {
    const repoRef = await readValue(task, "repo");
    const repoId = stringOrNull(customFields["repoId"] ?? task["repoId"] ?? readValueSync(repoRef, "id"));
    if (!repoId) return "";
    const repoResult = await this.repoRepository.findOne({ org: orgId, id: repoId });
    if (!repoResult) return "";
    const repo = recordFrom(repoResult);

    const lines = [
      `Repo: ${stringOrNull(repo["slug"] ?? repo["name"] ?? repo["id"]) ?? repoId}`,
      `Branch: ${stringOrNull(repo["currentBranch"] ?? repo["defaultBranch"]) ?? "unknown"}`,
    ];
    const commits = arrayOfRecords(repo["commits"]).slice(0, 5);
    if (commits.length > 0) {
      lines.push("Recent commits:");
      for (const commit of commits) {
        lines.push(`- ${stringOrNull(commit["sha"]) ?? ""} ${stringOrNull(commit["subject"]) ?? ""}`.trim());
      }
    }
    const tree = arrayOfStrings(repo["tree"]).slice(0, 20);
    if (tree.length > 0) {
      lines.push("Tree:");
      lines.push(...tree.map((entry) => `- ${entry}`));
    }
    return lines.join("\n");
  }

  private async skillPromptsSlice(orgId: string, agent: string | null): Promise<string> {
    const skills = (await this.skillRepository.find(
      { org: orgId },
      { orderBy: { slug: "ASC" } },
    )).map(recordFrom);
    return skills
      .filter((skill) => {
        if (!agent) return true;
        const enabledAgents = arrayOfStrings(skill["enabledAgents"]);
        return enabledAgents.length === 0 || enabledAgents.includes(agent);
      })
      .map((skill) => {
        const name = stringOrNull(skill["name"] ?? skill["slug"]) ?? "Skill";
        const description = stringOrNull(skill["description"]) ?? "";
        const triggers = arrayOfStrings(skill["triggers"]);
        return [
          `## ${name}`,
          description,
          triggers.length > 0 ? `Triggers: ${triggers.join(", ")}` : "",
        ].filter((part) => part !== "").join("\n");
      })
      .join("\n\n");
  }

  private async writeSnapshot(bundle: ContextBundle, runId: string | null): Promise<string> {
    const sizes = sliceSizes(bundle);
    if (isSnapshotWriter(this.snapshotWriterOrEm)) {
      return this.snapshotWriterOrEm.write({
        bundleBlob: bundle,
        tokenCount: bundle.tokenCount,
        sliceSizes: sizes,
      });
    }

    const em = this.snapshotWriterOrEm as EntityManager;
    const snapshot = em.create(ContextSnapshot, {
      org: { id: bundle.orgId } as Org,
      runId,
      taskId: bundle.taskId,
      bundleBlob: bundle as unknown as Record<string, unknown>,
      tokenCount: bundle.tokenCount,
      sliceSizes: sizes,
    });
    await em.save(snapshot);
    return snapshot.id;
  }
}

function sliceAllocations(tokenBudget: number): Record<ContextSliceKey, number> {
  return {
    memories: Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.memories),
    linkedDocs: Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.linkedDocs),
    recentRuns: Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.recentRuns),
    repoState: Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.repoState),
    skillPrompts: Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.skillPrompts),
  };
}

function makeSlice(content: string, allocation: number): ContextSlice {
  const clipped = clipToTokenBudget(content, allocation);
  return {
    content: clipped,
    tokenCount: estimateContextTokens(clipped),
  };
}

function clipToTokenBudget(content: string, tokenBudget: number): string {
  const trimmed = content.trim();
  if (trimmed === "" || tokenBudget <= 0) return "";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length <= tokenBudget) return trimmed;
  return tokens.slice(0, tokenBudget).join(" ");
}

function wikilinkTitles(input: string): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const title = match[1]?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

function docTitle(doc: UnknownRecord): string | null {
  const frontmatter = recordFrom(doc["frontmatter"]);
  return stringOrNull(frontmatter["title"] ?? frontmatter["slug"] ?? doc["title"]);
}

function renderDocSection(doc: UnknownRecord): string {
  const title = docTitle(doc) ?? stringOrNull(doc["id"]) ?? "Document";
  const body = firstParagraph(stringOrNull(doc["bodyMd"]) ?? "");
  return `## ${title}\n\n${body}`;
}

function firstParagraph(markdown: string): string {
  return markdown.split(/\n\s*\n/)[0]?.trim() ?? "";
}

function sortRunsDesc(runs: UnknownRecord[]): UnknownRecord[] {
  return [...runs].sort((left, right) => {
    const leftTime = dateMillis(left["startedAt"] ?? left["createdAt"]);
    const rightTime = dateMillis(right["startedAt"] ?? right["createdAt"]);
    return rightTime - leftTime;
  });
}

function renderRun(run: UnknownRecord, includeTranscript: boolean): string {
  const id = stringOrNull(run["id"]) ?? "unknown";
  const status = stringOrNull(run["status"]) ?? "unknown";
  const summary = stringOrNull(run["summary"]) ?? "";
  const lines = [`Run ${id}`, `Status: ${status}`];
  if (summary !== "") lines.push(`Summary: ${summary}`);
  const transcript = stringOrNull(run["transcript"]);
  if (includeTranscript && transcript) lines.push(`Transcript: ${transcript}`);
  return lines.join("\n");
}

function sliceSizes(bundle: ContextBundle): Record<ContextSliceKey, number> {
  return {
    memories: bundle.slices.memories.tokenCount,
    linkedDocs: bundle.slices.linkedDocs.tokenCount,
    recentRuns: bundle.slices.recentRuns.tokenCount,
    repoState: bundle.slices.repoState.tokenCount,
    skillPrompts: bundle.slices.skillPrompts.tokenCount,
  };
}

async function readValue(record: UnknownRecord, key: string): Promise<unknown> {
  const value = record[key];
  if (isPromiseLike(value)) return value;
  return value;
}

function readValueSync(value: unknown, key: string): unknown {
  return recordFrom(value)[key];
}

function readNested(record: UnknownRecord, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    current = recordFrom(current)[key];
  }
  return current;
}

function recordFrom(value: unknown): UnknownRecord {
  if (value && typeof value === "object") return value as UnknownRecord;
  return {};
}

function arrayOfRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(recordFrom) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function requireString(value: unknown, label: string): string {
  const result = stringOrNull(value);
  if (!result) throw new Error(`Missing ${label}.`);
  return result;
}

function dateMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? 0 : millis;
  }
  return 0;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return value != null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function";
}

function isSnapshotWriter(value: SnapshotWriterPort | EntityManager): value is SnapshotWriterPort {
  return "write" in value && typeof value.write === "function";
}

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
