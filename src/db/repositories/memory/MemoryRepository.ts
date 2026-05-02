/**
 * MemoryRepository — memory domain (Pillar 8).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Memory>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Memory } from "../../entities/memory/Memory.ts";
import type { MemoryImportance } from "../../entities/memory/enums.ts";
import type { NormalizedRetrieverOpts } from "../../../memory/retriever.ts";

@injectable()
export class MemoryRepository extends EntityRepository<Memory> {
  async searchProjectAndGlobal(opts: NormalizedRetrieverOpts): Promise<Memory[]> {
    const projectRows = opts.projectId
      ? await this.find(scopeCriteria(opts, "project") as never, {
        orderBy: { id: "asc" },
      })
      : [];
    const globalRows = await this.find(scopeCriteria(opts, "global") as never, {
      orderBy: { id: "asc" },
    });

    const byId = new Map<string, Memory>();
    for (const row of [...projectRows, ...globalRows]) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    return rankMemories([...byId.values()], opts.query)
      .slice(0, opts.topK)
      .map((row) => row.memory);
  }
}

type ScopeKind = "project" | "global";

interface RankedMemory {
  memory: Memory;
  textRank: number;
  recencyBoost: number;
  importanceBoost: number;
  score: number;
}

interface TokenizedMemory {
  memory: Memory;
  tokens: string[];
}

function scopeCriteria(
  opts: NormalizedRetrieverOpts,
  scope: ScopeKind,
): Record<string, unknown> {
  const criteria: Record<string, unknown> = { org: opts.orgId };
  if (!opts.includeArchived) criteria["archived"] = false;
  if (opts.kinds) criteria["kind"] = { $in: opts.kinds };
  if (scope === "project") {
    criteria["projectId"] = opts.projectId;
  } else {
    criteria["global"] = true;
  }
  return criteria;
}

function rankMemories(memories: Memory[], query: string): RankedMemory[] {
  const queryTerms = uniqueTerms(tokenize(query));
  const textRanks = textRankById(memories, queryTerms);
  const now = new Date();

  return memories
    .map((memory) => {
      const textRank = textRanks.get(memory.id) ?? 0;
      const recencyBoost = recencyBoostFor(memory, now);
      const importanceBoost = importanceBoostFor(memory.importance);
      const score = textRank + recencyBoost + importanceBoost;

      return { memory, textRank, recencyBoost, importanceBoost, score };
    })
    .filter((row) => queryTerms.length === 0 || row.textRank > 0)
    .sort(compareRankedMemories);
}

function textRankById(
  memories: Memory[],
  queryTerms: readonly string[],
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (memories.length === 0 || queryTerms.length === 0) return ranks;

  const docs = memories.map((memory) => ({
    memory,
    tokens: tokenize(`${memory.body} ${memory.tags.join(" ")}`),
  })) satisfies TokenizedMemory[];
  const avgLength = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) /
    docs.length || 1;
  const documentFrequency = documentFrequencyByTerm(docs, queryTerms);
  const documentCount = docs.length;
  const k1 = 1.2;
  const b = 0.75;

  for (const doc of docs) {
    const termFrequency = termFrequencyByTerm(doc.tokens);
    let score = 0;
    for (const term of queryTerms) {
      const frequency = termFrequency.get(term) ?? 0;
      if (frequency === 0) continue;

      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
      const denominator = frequency +
        k1 * (1 - b + b * (doc.tokens.length / avgLength));
      score += idf * ((frequency * (k1 + 1)) / denominator);
    }
    ranks.set(doc.memory.id, score);
  }

  return ranks;
}

function documentFrequencyByTerm(
  docs: readonly TokenizedMemory[],
  queryTerms: readonly string[],
): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const doc of docs) {
      if (doc.tokens.includes(term)) count += 1;
    }
    frequency.set(term, count);
  }
  return frequency;
}

function termFrequencyByTerm(tokens: readonly string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  return frequency;
}

function recencyBoostFor(memory: Memory, now: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, (now.getTime() - memory.createdAt.getTime()) / dayMs);
  return Math.exp(-ageDays / 30);
}

function importanceBoostFor(importance: MemoryImportance): number {
  if (importance === "high") return 1.5;
  if (importance === "medium") return 0.5;
  return 0;
}

function compareRankedMemories(left: RankedMemory, right: RankedMemory): number {
  return compareNumberDesc(left.score, right.score) ||
    compareNumberDesc(left.textRank, right.textRank) ||
    compareNumberDesc(left.recencyBoost, right.recencyBoost) ||
    compareNumberDesc(left.importanceBoost, right.importanceBoost) ||
    compareNumberDesc(left.memory.createdAt.getTime(), right.memory.createdAt.getTime()) ||
    compareStringAsc(left.memory.id, right.memory.id);
}

function compareNumberDesc(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function compareStringAsc(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function uniqueTerms(tokens: readonly string[]): string[] {
  return [...new Set(tokens)];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
