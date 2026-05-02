import { inject, injectable as Injectable } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";

import { ENTITY_MANAGER_TOKEN } from "../db/db.module.ts";
import { Org } from "../db/entities/auth/Org.ts";
import { ContextSnapshot } from "../db/entities/memory/ContextSnapshot.ts";
import { MemoryRetriever } from "../memory/retriever.ts";
import { TaskRepository } from "../db/repositories/tasks/TaskRepository.ts";
import { DocumentRepository } from "../db/repositories/docs/DocumentRepository.ts";
import { AgentRunRepository } from "../db/repositories/orchestration/AgentRunRepository.ts";
import { RepoRepository } from "../db/repositories/repos/RepoRepository.ts";
import { FulcrumSkillRepository } from "../db/repositories/skills/FulcrumSkillRepository.ts";

export const DEFAULT_CONTEXT_TOKEN_BUDGET = 8192;

export const CONTEXT_SLICE_WEIGHTS = {
  memories: 0.35,
  linkedDocs: 0.20,
  recentRuns: 0.20,
  repoState: 0.15,
  skillPrompts: 0.10,
} as const satisfies Record<ContextSliceKey, number>;

const SLICE_KEYS = [
  "memories",
  "linkedDocs",
  "recentRuns",
  "repoState",
  "skillPrompts",
] as const;

export type ContextSliceKey = typeof SLICE_KEYS[number];

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
  orgId?: string;
  projectId?: string | null;
  runId?: string | null;
  tokenBudget?: number;
  agent?: string;
  agentType?: string;
  skillSlugs?: string[];
  repoId?: string | null;
}

interface RetrieverPort {
  retrieve(
    query: string,
    opts: { orgId: string; projectId: string | null; topK: number },
  ): Promise<unknown[]>;
}

interface FindOneOrFailPort {
  findOneOrFail(where: unknown, options?: unknown): Promise<unknown>;
}

interface FindPort {
  find(where: unknown, options?: unknown): Promise<unknown[]>;
}

interface FindOnePort {
  findOne(where: unknown, options?: unknown): Promise<unknown | null>;
}

interface SnapshotWritePort {
  write(input: ContextSnapshotWriteInput): Promise<string>;
}

export interface ContextSnapshotWriteInput {
  orgId: string;
  taskId: string;
  runId: string | null;
  bundleBlob: ContextBundle;
  tokenCount: number;
  sliceSizes: Record<ContextSliceKey, number>;
}

@Injectable()
export class ContextSnapshotRepository implements SnapshotWritePort {
  constructor(private readonly em = inject(ENTITY_MANAGER_TOKEN)) {}

  async write(input: ContextSnapshotWriteInput): Promise<string> {
    const snapshot = this.em.create(ContextSnapshot, {
      org: this.em.getReference(Org, input.orgId),
      runId: input.runId,
      taskId: input.taskId,
      bundleBlob: input.bundleBlob as unknown as Record<string, unknown>,
      tokenCount: input.tokenCount,
      sliceSizes: input.sliceSizes,
    });

    this.em.persist(snapshot);
    await this.em.flush();
    return snapshot.id;
  }
}

@Injectable()
export class ContextAssembler {
  constructor(
    private readonly memoryRetriever: RetrieverPort = inject(MemoryRetriever),
    private readonly taskRepo: FindOneOrFailPort = inject(TaskRepository),
    private readonly docRepo: FindPort = inject(DocumentRepository),
    private readonly runRepo: FindPort = inject(AgentRunRepository),
    private readonly snapshotRepo: SnapshotWritePort = inject(ContextSnapshotRepository),
    private readonly repoRepo: FindOnePort = inject(RepoRepository),
    private readonly skillRepo: FindPort = inject(FulcrumSkillRepository),
  ) {}

  async assemble(
    taskId: string,
    opts: ContextAssembleOptions = {},
  ): Promise<{ bundle: ContextBundle; snapshotId: string }> {
    const task = await this.taskRepo.findOneOrFail(
      { id: taskId },
      { populate: ["org"] },
    );
    const orgId = opts.orgId ?? relationId(fieldValue(task, "org")) ??
      fail("ContextAssembler requires task org or opts.orgId.");
    const projectId = opts.projectId !== undefined
      ? opts.projectId
      : taskProjectId(task);
    const tokenBudget = normalizeTokenBudget(opts.tokenBudget);
    const query = `${taskTitle(task)} ${taskDescription(task)}`;

    const rawSlices: Record<ContextSliceKey, string> = {
      memories: await this.memoriesSlice(query, orgId, projectId),
      linkedDocs: await this.linkedDocsSlice(taskDescription(task), orgId, projectId),
      recentRuns: await this.recentRunsSlice(task, orgId, tokenBudget),
      repoState: await this.repoStateSlice(task, orgId, opts),
      skillPrompts: await this.skillPromptsSlice(task, orgId, opts),
    };

    const slices = truncateSlices(rawSlices, tokenBudget);
    const bundle = jsonbCanonicalize({
      taskId,
      orgId,
      projectId,
      tokenBudget,
      tokenCount: sumSliceTokens(slices),
      slices,
    }) as ContextBundle;
    const sliceSizes = sliceSizesFor(bundle);
    const snapshotId = await this.snapshotRepo.write({
      orgId,
      taskId,
      runId: opts.runId ?? null,
      bundleBlob: bundle,
      tokenCount: bundle.tokenCount,
      sliceSizes,
    });

    return { bundle, snapshotId };
  }

  private async memoriesSlice(
    query: string,
    orgId: string,
    projectId: string | null,
  ): Promise<string> {
    const memories = await this.memoryRetriever.retrieve(query, {
      orgId,
      projectId,
      topK: 20,
    });

    return memories
      .map(formatMemory)
      .filter((line) => line !== "")
      .join("\n");
  }

  private async linkedDocsSlice(
    description: string,
    orgId: string,
    projectId: string | null,
  ): Promise<string> {
    const linkTargets = extractWikilinks(description).slice(0, 5);
    if (linkTargets.length === 0) return "";

    const docs = await this.docRepo.find(
      projectId
        ? {
          org: orgId,
          archived: false,
          $or: [{ projectId }, { scope: "global" }],
        }
        : { org: orgId, archived: false, scope: "global" },
      { limit: 100, orderBy: { updatedAt: "DESC" } },
    );
    const docsByKey = indexDocuments(docs);
    const sections: string[] = [];

    for (const target of linkTargets) {
      const doc = docsByKey.get(normalizeLookup(target));
      if (!doc) continue;
      const title = documentTitle(doc, target);
      const paragraph = firstParagraph(textField(doc, "bodyMd"));
      const section = `## ${title}\n${paragraph}`;
      sections.push(truncateToTokenBudget(section, 200));
    }

    return sections.join("\n---\n");
  }

  private async recentRunsSlice(
    task: unknown,
    orgId: string,
    tokenBudget: number,
  ): Promise<string> {
    const taskId = textField(task, "id");
    const sameTaskRuns = sortRuns(await this.runRepo.find(
      { org: orgId, task: { id: taskId } },
      { populate: ["task"], limit: 3, orderBy: { startedAt: "DESC" } },
    )).slice(0, 3);
    const sprintId = taskSprintId(task);
    const siblingRuns = sprintId
      ? sortRuns(await this.runRepo.find(
        { org: orgId, task: { sprint: sprintId } },
        { populate: ["task"], limit: 5, orderBy: { startedAt: "DESC" } },
      ))
        .filter((run) => runTaskId(run) !== taskId)
        .slice(0, 2)
      : [];
    const runs = [...sameTaskRuns, ...siblingRuns];
    if (runs.length === 0) return "";

    const withTranscript = formatRuns(runs, true);
    const allocation = Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS.recentRuns);
    if (estimateContextTokens(withTranscript) <= allocation) return withTranscript;

    const summaryOnly = formatRuns(runs, false);
    if (estimateContextTokens(summaryOnly) <= allocation) return summaryOnly;

    return formatRunHeads(runs);
  }

  private async repoStateSlice(
    task: unknown,
    orgId: string,
    opts: ContextAssembleOptions,
  ): Promise<string> {
    const repoId = opts.repoId !== undefined ? opts.repoId : taskRepoId(task);
    if (!repoId) return "";

    const repo = await this.repoRepo.findOne({ org: orgId, id: repoId });
    if (!repo) return "";

    const branch = textField(repo, "currentBranch") ||
      textField(repo, "branch");
    const commits = arrayField(repo, "commits").slice(0, 5).map(formatCommit);
    const tree = arrayField(repo, "tree")
      .map((entry) => typeof entry === "string" ? entry : textField(entry, "path"))
      .filter((path) => path !== "")
      .filter((path) => path.split("/").filter(Boolean).length <= 2);
    const lines = [
      branch ? `branch: ${branch}` : "",
      commits.length > 0 ? `commits:\n${commits.map((line) => `- ${line}`).join("\n")}` : "",
      tree.length > 0 ? `tree:\n${tree.map((line) => `- ${line}`).join("\n")}` : "",
    ].filter((line) => line !== "");

    return lines.join("\n");
  }

  private async skillPromptsSlice(
    task: unknown,
    orgId: string,
    opts: ContextAssembleOptions,
  ): Promise<string> {
    const agent = opts.agent ?? opts.agentType ??
      (textField(task, "agent") || textField(taskCustomFields(task), "agent"));
    if (!agent) return "";

    const skillSlugs = opts.skillSlugs ?? stringArrayField(taskCustomFields(task), "skillSlugs");
    const skills = await this.skillRepo.find(
      { org: orgId },
      { orderBy: { name: "ASC" } },
    );
    const matching = skills
      .filter((skill) => skillEnabledForAgent(skill, agent))
      .filter((skill) => skillSlugs.length === 0 || skillSlugs.includes(textField(skill, "slug")));

    return matching
      .map(formatSkill)
      .filter((line) => line !== "")
      .join("\n---\n");
  }
}

export function replayContextSnapshot(bundleBlob: unknown): ContextBundle {
  return bundleBlob as ContextBundle;
}

export function estimateContextTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return Math.ceil(trimmed.split(/\s+/).length * 1.3);
}

function truncateSlices(
  rawSlices: Record<ContextSliceKey, string>,
  tokenBudget: number,
): Record<ContextSliceKey, ContextSlice> {
  const entries = SLICE_KEYS.map((key) => {
    const allocation = Math.floor(tokenBudget * CONTEXT_SLICE_WEIGHTS[key]);
    const content = truncateToTokenBudget(rawSlices[key], allocation);
    return [key, { content, tokenCount: estimateContextTokens(content) }] as const;
  });

  return Object.fromEntries(entries) as Record<ContextSliceKey, ContextSlice>;
}

function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const trimmed = text.trim();
  if (trimmed === "" || tokenBudget <= 0) return "";
  if (estimateContextTokens(trimmed) <= tokenBudget) return trimmed;

  const words = trimmed.split(/\s+/);
  const maxWords = Math.floor(tokenBudget / 1.3);
  if (maxWords <= 0) return "";
  return words.slice(0, maxWords).join(" ");
}

function normalizeTokenBudget(tokenBudget: number | undefined): number {
  if (tokenBudget === undefined) return DEFAULT_CONTEXT_TOKEN_BUDGET;
  if (!Number.isFinite(tokenBudget) || tokenBudget <= 0) {
    throw new Error("Context tokenBudget must be a positive number.");
  }
  return Math.floor(tokenBudget);
}

function sumSliceTokens(slices: Record<ContextSliceKey, ContextSlice>): number {
  return SLICE_KEYS.reduce((sum, key) => sum + slices[key].tokenCount, 0);
}

function sliceSizesFor(bundle: ContextBundle): Record<ContextSliceKey, number> {
  return {
    memories: bundle.slices.memories.tokenCount,
    linkedDocs: bundle.slices.linkedDocs.tokenCount,
    recentRuns: bundle.slices.recentRuns.tokenCount,
    repoState: bundle.slices.repoState.tokenCount,
    skillPrompts: bundle.slices.skillPrompts.tokenCount,
  };
}

function formatMemory(memory: unknown): string {
  const body = textField(memory, "body");
  if (!body) return "";
  const kind = textField(memory, "kind") || "memory";
  const importance = textField(memory, "importance");
  const prefix = importance ? `${kind}/${importance}` : kind;
  return `- ${prefix}: ${body}`;
}

function extractWikilinks(text: string): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1]?.split("|")[0]?.split("#")[0]?.trim() ?? "";
    if (!raw) continue;
    const key = normalizeLookup(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(raw);
  }
  return targets;
}

function indexDocuments(docs: unknown[]): Map<string, unknown> {
  const indexed = new Map<string, unknown>();
  for (const doc of docs) {
    for (const key of documentLookupKeys(doc)) {
      if (!indexed.has(key)) indexed.set(key, doc);
    }
  }
  return indexed;
}

function documentLookupKeys(doc: unknown): string[] {
  const frontmatter = recordField(doc, "frontmatter");
  return [
    textField(doc, "id"),
    textField(doc, "externalId"),
    textField(frontmatter, "title"),
    textField(frontmatter, "slug"),
  ].filter((key) => key !== "").map(normalizeLookup);
}

function documentTitle(doc: unknown, fallback: string): string {
  return textField(recordField(doc, "frontmatter"), "title") ||
    textField(doc, "externalId") ||
    fallback;
}

function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/)[0]?.trim() ?? "";
}

function sortRuns(runs: unknown[]): unknown[] {
  return [...runs].sort((left, right) =>
    timeValue(right, "startedAt") - timeValue(left, "startedAt") ||
    textField(left, "id").localeCompare(textField(right, "id"))
  );
}

function formatRuns(runs: unknown[], includeTranscript: boolean): string {
  return runs.map((run) => {
    const lines = [
      `- ${textField(run, "id")}: ${textField(run, "status") || "unknown"}`,
      runSummary(run) ? `  summary: ${runSummary(run)}` : "",
      includeTranscript && runTranscript(run) ? `  transcript: ${runTranscript(run)}` : "",
    ].filter((line) => line !== "");
    return lines.join("\n");
  }).join("\n");
}

function formatRunHeads(runs: unknown[]): string {
  return runs.map((run) =>
    `- ${textField(run, "id")}: ${textField(run, "status") || "unknown"}`
  ).join("\n");
}

function runSummary(run: unknown): string {
  return textField(run, "summary") ||
    textField(recordField(run, "customFields"), "summary") ||
    textField(run, "lastErrorKind");
}

function runTranscript(run: unknown): string {
  return textField(run, "transcript") ||
    textField(recordField(run, "customFields"), "transcript") ||
    textField(run, "transcriptText");
}

function runTaskId(run: unknown): string | null {
  return textField(run, "taskId") || relationId(fieldValue(run, "task"));
}

function taskTitle(task: unknown): string {
  return textField(task, "title") ||
    textField(taskCustomFields(task), "title") ||
    textField(task, "externalId") ||
    textField(task, "id");
}

function taskDescription(task: unknown): string {
  return textField(task, "description") ||
    textField(taskCustomFields(task), "description");
}

function taskProjectId(task: unknown): string | null {
  return textField(task, "projectId") ||
    textField(taskCustomFields(task), "projectId") ||
    null;
}

function taskSprintId(task: unknown): string | null {
  return relationId(fieldValue(task, "sprint")) ||
    textField(task, "sprintId") ||
    textField(taskCustomFields(task), "sprintId") ||
    null;
}

function taskRepoId(task: unknown): string | null {
  return textField(task, "repoId") ||
    textField(taskCustomFields(task), "repoId") ||
    null;
}

function taskCustomFields(task: unknown): Record<string, unknown> {
  return recordField(task, "customFields");
}

function skillEnabledForAgent(skill: unknown, agent: string): boolean {
  const enabledAgents = stringArrayField(skill, "enabledAgents");
  return enabledAgents.includes("*") || enabledAgents.includes(agent);
}

function formatSkill(skill: unknown): string {
  const name = textField(skill, "name") || textField(skill, "slug");
  if (!name) return "";
  const description = textField(skill, "description") ||
    textField(recordField(skill, "frontmatter"), "description");
  const triggers = stringArrayField(skill, "triggers");
  return [
    `## ${name}`,
    description ? `description: ${description}` : "",
    triggers.length > 0 ? `triggers: ${triggers.join(", ")}` : "",
  ].filter((line) => line !== "").join("\n");
}

function formatCommit(commit: unknown): string {
  if (typeof commit === "string") return commit;
  const sha = textField(commit, "sha");
  const subject = textField(commit, "subject") || textField(commit, "message");
  if (sha && subject) return `${sha} ${subject}`;
  return sha || subject;
}

function arrayField(record: unknown, key: string): unknown[] {
  const direct = fieldValue(record, key);
  if (Array.isArray(direct)) return direct;
  const custom = fieldValue(recordField(record, "customFields"), key);
  return Array.isArray(custom) ? custom : [];
}

function stringArrayField(record: unknown, key: string): string[] {
  return arrayField(record, key).filter((item): item is string => typeof item === "string");
}

function textField(record: unknown, key: string): string {
  const direct = fieldValue(record, key);
  if (typeof direct === "string") return direct;
  const custom = fieldValue(recordField(record, "customFields"), key);
  return typeof custom === "string" ? custom : "";
}

function recordField(record: unknown, key: string): Record<string, unknown> {
  const value = fieldValue(record, key);
  return isRecord(value) ? value : {};
}

function fieldValue(record: unknown, key: string): unknown {
  if (!isRecord(record)) return undefined;
  return record[key];
}

function relationId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value["id"] === "string") return value["id"];
  return null;
}

function timeValue(record: unknown, key: string): number {
  const value = fieldValue(record, key);
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsonbCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbCanonicalize);
  if (!isRecord(value) || value instanceof Date) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort(compareJsonbKeys)
      .map((key) => [key, jsonbCanonicalize(value[key])]),
  );
}

function compareJsonbKeys(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right);
}

function fail(message: string): never {
  throw new Error(message);
}
