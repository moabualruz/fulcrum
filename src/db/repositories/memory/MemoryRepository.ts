/**
 * MemoryRepository — memory domain (Pillar 8).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Memory>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, raw } from "@mikro-orm/postgresql";
import type { Memory } from "../../entities/memory/Memory.ts";
import type { MemoryImportance } from "../../entities/memory/enums.ts";
import type { NormalizedRetrieverOpts } from "../../../memory/retriever.ts";

const MIN_CANDIDATES = 50;
const MAX_CANDIDATES = 500;
const CANDIDATE_MULTIPLIER = 10;

export const MEMORY_IMPORTANCE_BOOSTS = {
  high: 1,
  medium: 0,
  low: 0,
} as const satisfies Record<MemoryImportance, number>;

@injectable()
export class MemoryRepository extends EntityRepository<Memory> {
  /**
   * Overload 1: simple (orgId, projectId) signature for ContextBundleService (D-25).
   * Returns recent project + global memories without FTS ranking (empty-query path).
   */
  searchProjectAndGlobal(orgId: string, projectId: string): Promise<Memory[]>;
  /**
   * Overload 2: full opts signature used by Retriever for ranked search.
   */
  searchProjectAndGlobal(opts: NormalizedRetrieverOpts): Promise<Memory[]>;
  async searchProjectAndGlobal(
    optsOrOrgId: NormalizedRetrieverOpts | string,
    projectId?: string,
  ): Promise<Memory[]> {
    // Normalise: if first arg is a string, build minimal opts for bundle assembly
    const opts: NormalizedRetrieverOpts =
      typeof optsOrOrgId === "string"
        ? {
            orgId: optsOrOrgId,
            projectId: projectId ?? null,
            query: "",
            topK: 20,
            includeArchived: false,
            kinds: undefined,
          }
        : optsOrOrgId;

    return this._searchProjectAndGlobal(opts);
  }

  private async _searchProjectAndGlobal(opts: NormalizedRetrieverOpts): Promise<Memory[]> {
    const candidates = opts.query.trim() === ""
      ? await this.emptyQueryCandidates(opts)
      : await this.ftsCandidates(opts);

    const textRankById = new Map<string, number>();
    for (const candidate of candidates) {
      const current = textRankById.get(candidate.id);
      if (current === undefined || candidate.textRank > current) {
        textRankById.set(candidate.id, candidate.textRank);
      }
    }
    const ids = [...textRankById.keys()];
    if (ids.length === 0) return [];

    const memories = await this.find({
      org: opts.orgId,
      id: { $in: ids },
    } as never);

    return rankMemories(memories, textRankById)
      .slice(0, opts.topK)
      .map((row) => row.memory);
  }

  private async ftsCandidates(
    opts: NormalizedRetrieverOpts,
  ): Promise<ScoredMemoryCandidate[]> {
    const query = opts.query.trim();
    const rankSql =
      "ts_rank_cd(to_tsvector('english', m.body), plainto_tsquery('english', ?))";
    const rank = raw(rankSql, [query]);
    const qb = this.createQueryBuilder("m")
      .select(["m.id", raw(`${rankSql} as text_rank`, [query])] as never)
      .where({ org: opts.orgId } as never)
      .andWhere(
        "to_tsvector('english', m.body) @@ plainto_tsquery('english', ?)",
        [query],
      )
      .orderBy([
        { [rank]: "DESC" },
        { createdAt: "DESC" },
        { id: "ASC" },
      ] as never)
      .limit(candidateLimit(opts));

    applyTypedFilters(qb, opts);

    const rows = await qb.execute<CandidateRow[]>("all", false);
    return rows.map(toCandidate);
  }

  private async emptyQueryCandidates(
    opts: NormalizedRetrieverOpts,
  ): Promise<ScoredMemoryCandidate[]> {
    const importanceRank = raw(
      "case when m.importance = 'high' then 1 else 0 end",
    );
    const qb = this.createQueryBuilder("m")
      .select(["m.id", raw("0 as text_rank")] as never)
      .where({ org: opts.orgId } as never)
      .orderBy([
        { [importanceRank]: "DESC" },
        { createdAt: "DESC" },
        { id: "ASC" },
      ] as never)
      .limit(candidateLimit(opts));

    applyTypedFilters(qb, opts);

    const rows = await qb.execute<CandidateRow[]>("all", false);
    return rows.map(toCandidate);
  }
}

interface RankedMemory {
  memory: Memory;
  textRank: number;
  recencyBoost: number;
  importanceBoost: number;
  score: number;
}

interface ScoredMemoryCandidate {
  id: string;
  textRank: number;
}

interface CandidateRow {
  id: string;
  text_rank: number | string;
}

function applyTypedFilters(
  qb: ReturnType<MemoryRepository["createQueryBuilder"]>,
  opts: NormalizedRetrieverOpts,
): void {
  if (!opts.includeArchived) qb.andWhere({ archived: false } as never);
  if (opts.kinds) qb.andWhere({ kind: { $in: opts.kinds } } as never);
  if (opts.projectId) {
    qb.andWhere({
      $or: [{ projectId: opts.projectId }, { global: true }],
    } as never);
  } else {
    qb.andWhere({ global: true } as never);
  }
}

function rankMemories(
  memories: Memory[],
  textRankById: ReadonlyMap<string, number>,
): RankedMemory[] {
  const now = new Date();

  return memories.map((memory) => {
    const textRank = textRankById.get(memory.id) ?? 0;
    const recencyBoost = recencyBoostFor(memory, now);
    const importanceBoost = importanceBoostFor(memory.importance);
    const score = textRank + recencyBoost + importanceBoost;

    return { memory, textRank, recencyBoost, importanceBoost, score };
  }).sort(compareRankedMemories);
}

function recencyBoostFor(memory: Memory, now: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, (now.getTime() - memory.createdAt.getTime()) / dayMs);
  return Math.exp(-ageDays / 30);
}

function importanceBoostFor(importance: MemoryImportance): number {
  return MEMORY_IMPORTANCE_BOOSTS[importance];
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

function candidateLimit(opts: NormalizedRetrieverOpts): number {
  return Math.min(
    MAX_CANDIDATES,
    Math.max(MIN_CANDIDATES, opts.topK * CANDIDATE_MULTIPLIER),
  );
}

function toCandidate(row: CandidateRow): ScoredMemoryCandidate {
  return {
    id: row.id,
    textRank: Number(row.text_rank),
  };
}
