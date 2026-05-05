import { assertEmbeddingDimension, DEFAULT_EMBEDDING_DIMENSION } from "../../inference/model-metadata.ts";
import type { MemoryImportance } from "../../db/entities/memory/enums.ts";
import { cosineSimilarity, hybridScore } from "./hybrid-scoring.ts";

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_DECAY_DAYS = 30;

export const MEMORY_RETRIEVER_IMPORTANCE_BOOSTS = {
  high: 1,
  medium: 0,
  low: 0,
} as const satisfies Record<MemoryImportance, number>;

export interface MemoryRankInput {
  id: string;
  body: string;
  createdAt: Date;
  importance: MemoryImportance;
}

export interface RankedMemoryMatch<TMemory extends MemoryRankInput = MemoryRankInput> {
  memory: TMemory;
  textRank: number;
  recencyBoost: number;
  importanceBoost: number;
  score: number;
}

export interface RankMemoryMatchesOptions {
  now?: Date;
  topK?: number;
  k1?: number;
  b?: number;
}

export function rankMemoryMatches<TMemory extends MemoryRankInput>(
  query: string,
  memories: readonly TMemory[],
  options: RankMemoryMatchesOptions = {},
): RankedMemoryMatch<TMemory>[] {
  const queryTerms = tokenize(query);
  const now = options.now ?? new Date();
  const k1 = options.k1 ?? DEFAULT_K1;
  const b = options.b ?? DEFAULT_B;
  const tokenized = memories.map((memory) => ({
    memory,
    terms: tokenize(memory.body),
  }));
  const averageDocumentLength = averageLength(tokenized.map((row) => row.terms.length));
  const documentFrequencies = documentFrequenciesFor(queryTerms, tokenized);

  const ranked = tokenized.map(({ memory, terms }) => {
    const textRank = bm25Score(
      queryTerms,
      terms,
      memories.length,
      averageDocumentLength,
      documentFrequencies,
      k1,
      b,
    );
    const recencyBoost = recencyBoostForDate(memory.createdAt, now);
    const importanceBoost = importanceBoostFor(memory.importance);
    const score = textRank + recencyBoost + importanceBoost;

    return { memory, textRank, recencyBoost, importanceBoost, score };
  }).sort(compareRankedMatches);

  return options.topK === undefined ? ranked : ranked.slice(0, options.topK);
}

export function recencyBoostForDate(createdAt: Date, now = new Date()): number {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);
  return Math.exp(-ageDays / RECENCY_DECAY_DAYS);
}

export function importanceBoostFor(importance: MemoryImportance): number {
  return MEMORY_RETRIEVER_IMPORTANCE_BOOSTS[importance];
}

function bm25Score(
  queryTerms: readonly string[],
  documentTerms: readonly string[],
  documentCount: number,
  averageDocumentLength: number,
  documentFrequencies: ReadonlyMap<string, number>,
  k1: number,
  b: number,
): number {
  if (queryTerms.length === 0 || documentTerms.length === 0 || documentCount === 0) {
    return 0;
  }

  const termFrequencies = termFrequenciesFor(documentTerms);
  let score = 0;

  for (const term of new Set(queryTerms)) {
    const termFrequency = termFrequencies.get(term) ?? 0;
    if (termFrequency === 0) continue;

    const documentFrequency = documentFrequencies.get(term) ?? 0;
    const inverseDocumentFrequency = Math.log(
      1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5),
    );
    const lengthNormalization = k1 *
      (1 - b + b * (documentTerms.length / averageDocumentLength));
    score += inverseDocumentFrequency *
      ((termFrequency * (k1 + 1)) / (termFrequency + lengthNormalization));
  }

  return score;
}

function tokenize(input: string): string[] {
  return input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function averageLength(lengths: readonly number[]): number {
  if (lengths.length === 0) return 1;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return Math.max(1, total / lengths.length);
}

function documentFrequenciesFor(
  queryTerms: readonly string[],
  tokenized: readonly { terms: readonly string[] }[],
): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    let count = 0;
    for (const document of tokenized) {
      if (document.terms.includes(term)) count++;
    }
    frequencies.set(term, count);
  }
  return frequencies;
}

function termFrequenciesFor(terms: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const term of terms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  return frequencies;
}

function compareRankedMatches(
  left: RankedMemoryMatch,
  right: RankedMemoryMatch,
): number {
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

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid scoring (gated: FULCRUM_FEATURES=embeddings)
// ─────────────────────────────────────────────────────────────────────────────

export interface HybridMemoryRankInput extends MemoryRankInput {
  embedding: number[];
}

export interface HybridRankedMemoryMatch<TMemory extends HybridMemoryRankInput = HybridMemoryRankInput> {
  memory: TMemory;
  hybridBase: number;
  recencyBoost: number;
  importanceBoost: number;
  score: number;
}

export interface RankHybridOptions {
  now?: Date;
  topK?: number;
  k1?: number;
  b?: number;
}

/**
 * Hybrid ranking: 0.6 * normalize(bm25) + 0.4 * cosine(queryEmbed, memEmbed)
 * plus additive recency + importance boosts.
 */
export function rankMemoryMatchesHybrid<TMemory extends HybridMemoryRankInput>(
  query: string,
  memories: readonly TMemory[],
  queryEmbedding: readonly number[],
  options: RankHybridOptions = {},
): HybridRankedMemoryMatch<TMemory>[] {
  // Validate dimensions before scoring — fail closed per D-07
  assertEmbeddingDimension(queryEmbedding as number[], DEFAULT_EMBEDDING_DIMENSION);
  for (const mem of memories) {
    assertEmbeddingDimension(mem.embedding, DEFAULT_EMBEDDING_DIMENSION);
  }

  const queryTerms = tokenize(query);
  const now = options.now ?? new Date();
  const k1 = options.k1 ?? DEFAULT_K1;
  const b = options.b ?? DEFAULT_B;

  const tokenized = memories.map((memory) => ({
    memory,
    terms: tokenize(memory.body),
  }));
  const avgDocLen = averageLength(tokenized.map((r) => r.terms.length));
  const docFreqs = documentFrequenciesFor(queryTerms, tokenized);

  // Compute raw BM25 scores to find max
  const bm25Scores = tokenized.map(({ terms }) =>
    bm25Score(queryTerms, terms, memories.length, avgDocLen, docFreqs, k1, b),
  );
  const maxBm25 = bm25Scores.reduce((max, s) => Math.max(max, s), 0);

  const ranked = tokenized.map(({ memory }, i) => {
    const cosine = cosineSimilarity(queryEmbedding as number[], memory.embedding);
    const hybridBase = hybridScore(bm25Scores[i] ?? 0, maxBm25, cosine);
    const recencyBoost = recencyBoostForDate(memory.createdAt, now);
    const importanceBoost_ = importanceBoostFor(memory.importance);
    const score = hybridBase + recencyBoost + importanceBoost_;

    return {
      memory,
      hybridBase,
      recencyBoost,
      importanceBoost: importanceBoost_,
      score,
    };
  }).sort(compareHybridMatches);

  return options.topK === undefined ? ranked : ranked.slice(0, options.topK);
}

function compareHybridMatches(
  left: HybridRankedMemoryMatch,
  right: HybridRankedMemoryMatch,
): number {
  return compareNumberDesc(left.score, right.score) ||
    compareNumberDesc(left.hybridBase, right.hybridBase) ||
    compareNumberDesc(left.recencyBoost, right.recencyBoost) ||
    compareNumberDesc(left.importanceBoost, right.importanceBoost) ||
    compareNumberDesc(left.memory.createdAt.getTime(), right.memory.createdAt.getTime()) ||
    compareStringAsc(left.memory.id, right.memory.id);
}
