/**
 * MemoryRepository.
 *
 * Memory-specific query helpers backed by TypeORM Repository.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { EntityManager, FindOptionsWhere, DeepPartial } from "typeorm";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import type { MemoryImportance } from "@knowledge-workspace/infrastructure/database/entities/memory/enums.ts";
import type { NormalizedRetrieverOpts } from "@knowledge-workspace/application/memory/retriever.ts";

const MIN_CANDIDATES = 50;
const MAX_CANDIDATES = 500;
const CANDIDATE_MULTIPLIER = 10;

export const MEMORY_IMPORTANCE_BOOSTS = {
  high: 1,
  medium: 0,
  low: 0,
} as const satisfies Record<MemoryImportance, number>;

@Injectable()
export class MemoryRepository {
  constructor(
    @InjectRepository(Memory)
    private readonly memories: Repository<Memory>,
  ) {}

  /**
   * Overload 1: simple (orgId, projectId) signature for context bundle assembly.
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

  get manager(): EntityManager {
    return this.memories.manager;
  }

  getEntityManager(): EntityManager {
    return this.memories.manager;
  }

  findOne(where: FindOptionsWhere<Memory>): Promise<Memory | null> {
    return this.memories.findOne({ where });
  }

  create(data: DeepPartial<Memory>): Memory {
    return this.memories.create(data);
  }

  update(where: FindOptionsWhere<Memory>, data: DeepPartial<Memory>): Promise<unknown> {
    return this.memories.update(where, data as never);
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

    const memories = await this.memories.findByIds(ids);

    return rankMemories(memories, textRankById)
      .slice(0, opts.topK)
      .map((row) => row.memory);
  }

  private async ftsCandidates(
    opts: NormalizedRetrieverOpts,
  ): Promise<ScoredMemoryCandidate[]> {
    const query = opts.query.trim();
    const limit = candidateLimit(opts);

    const qb = this.memories.createQueryBuilder("m")
      .select("m.id", "id")
      .addSelect(
        `ts_rank_cd(to_tsvector('english', m.body), plainto_tsquery('english', :query))`,
        "text_rank",
      )
      .where("m.org_id = :orgId", { orgId: opts.orgId })
      .andWhere(
        `to_tsvector('english', m.body) @@ plainto_tsquery('english', :query)`,
        { query },
      )
      .orderBy(
        `ts_rank_cd(to_tsvector('english', m.body), plainto_tsquery('english', :query))`,
        "DESC",
      )
      .addOrderBy("m.created_at", "DESC")
      .addOrderBy("m.id", "ASC")
      .limit(limit);

    if (!opts.includeArchived) qb.andWhere("m.archived = false");
    if (opts.kinds) qb.andWhere("m.kind IN (:...kinds)", { kinds: opts.kinds });
    if (opts.projectId) {
      qb.andWhere("(m.project_id = :projectId OR m.global = true)", { projectId: opts.projectId });
    } else {
      qb.andWhere("m.global = true");
    }

    const rows = await qb.getRawMany<CandidateRow>();
    return rows.map(toCandidate);
  }

  private async emptyQueryCandidates(
    opts: NormalizedRetrieverOpts,
  ): Promise<ScoredMemoryCandidate[]> {
    const limit = candidateLimit(opts);

    const qb = this.memories.createQueryBuilder("m")
      .select("m.id", "id")
      .addSelect("0", "text_rank")
      .where("m.org_id = :orgId", { orgId: opts.orgId })
      .orderBy("CASE WHEN m.importance = 'high' THEN 1 ELSE 0 END", "DESC")
      .addOrderBy("m.created_at", "DESC")
      .addOrderBy("m.id", "ASC")
      .limit(limit);

    if (!opts.includeArchived) qb.andWhere("m.archived = false");
    if (opts.kinds) qb.andWhere("m.kind IN (:...kinds)", { kinds: opts.kinds });
    if (opts.projectId) {
      qb.andWhere("(m.project_id = :projectId OR m.global = true)", { projectId: opts.projectId });
    } else {
      qb.andWhere("m.global = true");
    }

    const rows = await qb.getRawMany<CandidateRow>();
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
