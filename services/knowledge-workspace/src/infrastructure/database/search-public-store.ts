import { randomUUID } from "node:crypto";
import { DataSource, In } from "typeorm";

import {
  type KnowledgeWorkspaceSavedSearch,
  type KnowledgeWorkspaceSearchEntry,
  KnowledgeWorkspaceSavedSearchEntity,
  KnowledgeWorkspaceSearchClickEntity,
  KnowledgeWorkspaceSearchEntryEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface SearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export interface SavedSearchRow {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  query_json: string;
  scope: "private" | "project" | "org";
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchClickAck {
  recorded: true;
}

export interface SearchSnapshot {
  snapshot: string;
}

export class SearchPublicValidationError extends Error {}

export class SearchPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async search(input: {
    q: string;
    orgId: string;
    projectId?: string | null;
    sourceKinds?: string[];
    limit?: number;
  }): Promise<SearchHit[]> {
    const queryText = input.q.trim().toLowerCase();
    if (!queryText) return [];

    const query = this.dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity)
      .createQueryBuilder("entry")
      .addSelect(
        "ts_rank(to_tsvector('english', coalesce(entry.title, '') || ' ' || coalesce(entry.search_text, '')), plainto_tsquery('english', :ftsQuery))",
        "rank",
      )
      .innerJoin("fulcrum_projects", "project", "project.id = entry.project_id")
      .where("project.workspace_id = :orgId", { orgId: input.orgId })
      .andWhere(
        "to_tsvector('english', coalesce(entry.title, '') || ' ' || coalesce(entry.search_text, '')) @@ plainto_tsquery('english', :ftsQuery)",
        { ftsQuery: queryText },
      )
      .orderBy("rank", "DESC")
      .addOrderBy("entry.updatedAt", "DESC")
      .addOrderBy("entry.id", "ASC")
      .limit(input.limit ?? 25);

    if (input.projectId !== undefined) {
      if (input.projectId === null) return [];
      query.andWhere("entry.project_id = :projectId", { projectId: input.projectId });
    }
    if (input.sourceKinds && input.sourceKinds.length > 0) {
      query.andWhere("entry.source_kind IN (:...sourceKinds)", { sourceKinds: input.sourceKinds });
    }

    const { entities, raw } = await query.getRawAndEntities();
    return entities.map((entry, index) => toSearchHit(entry, Number(raw[index]?.rank ?? 0)));
  }

  async suggest(input: {
    prefix: string;
    orgId: string;
    kind?: string;
    limit?: number;
  }): Promise<string[]> {
    const prefix = input.prefix.trim().toLowerCase();
    if (!prefix) return [];

    const query = this.dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity)
      .createQueryBuilder("entry")
      .select("DISTINCT entry.title", "title")
      .innerJoin("fulcrum_projects", "project", "project.id = entry.project_id")
      .where("project.workspace_id = :orgId", { orgId: input.orgId })
      .andWhere("LOWER(entry.title) LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("entry.title", "ASC")
      .limit(input.limit ?? 5);

    if (input.kind) {
      query.andWhere("entry.source_kind = :kind", { kind: input.kind });
    }

    const rows = await query.getRawMany<{ title: string }>();
    return rows.map((row) => row.title);
  }

  async listSavedSearches(input: {
    orgId: string;
    userId: string;
  }): Promise<SavedSearchRow[]> {
    const rows = await this.dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity).find({
      where: [
        { workspaceId: input.orgId, userId: input.userId },
        { workspaceId: input.orgId, scope: In(["project", "org"]) },
      ],
      order: { createdAt: "DESC", id: "ASC" },
    });
    return rows.map(toSavedSearchRow);
  }

  async createSavedSearch(input: {
    orgId: string;
    userId: string;
    name: string;
    queryJson: Record<string, unknown>;
    scope: "private" | "project" | "org";
    projectId?: string | null;
  }): Promise<SavedSearchRow> {
    const projectId = await this.normalizeSavedSearchProject(input.orgId, input.scope, input.projectId);
    const saved = await this.dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity).save({
      id: randomUUID(),
      workspaceId: input.orgId,
      userId: input.userId,
      name: input.name,
      queryJson: input.queryJson,
      scope: input.scope,
      projectId,
    });
    return toSavedSearchRow(saved);
  }

  async updateSavedSearch(input: {
    orgId: string;
    userId: string;
    id: string;
    name?: string;
    queryJson?: Record<string, unknown>;
    scope?: "private" | "project" | "org";
    projectId?: string | null;
  }): Promise<SavedSearchRow | null> {
    const repository = this.dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity);
    const saved = await repository.findOneBy({
      id: input.id,
      workspaceId: input.orgId,
      userId: input.userId,
    });
    if (!saved) return null;

    const nextScope = input.scope ?? saved.scope as "private" | "project" | "org";
    const nextProjectId = input.projectId !== undefined ? input.projectId : saved.projectId;
    const projectId = await this.normalizeSavedSearchProject(input.orgId, nextScope, nextProjectId);

    if (input.name !== undefined) saved.name = input.name;
    if (input.queryJson !== undefined) saved.queryJson = input.queryJson;
    if (input.scope !== undefined) saved.scope = input.scope;
    saved.projectId = projectId;
    saved.updatedAt = new Date();

    return toSavedSearchRow(await repository.save(saved));
  }

  async deleteSavedSearch(input: {
    orgId: string;
    userId: string;
    id: string;
  }): Promise<{ deleted: true; id: string } | null> {
    const repository = this.dataSource.getRepository(KnowledgeWorkspaceSavedSearchEntity);
    const saved = await repository.findOneBy({
      id: input.id,
      workspaceId: input.orgId,
      userId: input.userId,
    });
    if (!saved) return null;
    await repository.remove(saved);
    return { deleted: true, id: input.id };
  }

  async recordClick(input: {
    orgId: string;
    userId: string;
    query: string;
    resultId: string;
    resultKind: string;
    position?: number;
    projectId?: string | null;
  }): Promise<SearchClickAck> {
    if (input.projectId) {
      await this.requireProjectInWorkspace(input.orgId, input.projectId);
    }
    await this.dataSource.getRepository(KnowledgeWorkspaceSearchClickEntity).save({
      id: randomUUID(),
      workspaceId: input.orgId,
      userId: input.userId,
      query: input.query,
      resultId: input.resultId,
      resultKind: input.resultKind,
      position: input.position ?? null,
      projectId: input.projectId ?? null,
    });
    return { recorded: true };
  }

  async snapshot(input: {
    orgId: string;
    projectId?: string | null;
  }): Promise<SearchSnapshot> {
    const query = this.dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity)
      .createQueryBuilder("entry")
      .innerJoin("fulcrum_projects", "project", "project.id = entry.project_id")
      .where("project.workspace_id = :orgId", { orgId: input.orgId })
      .orderBy("entry.updatedAt", "DESC")
      .addOrderBy("entry.id", "ASC")
      .limit(100);

    if (input.projectId !== undefined) {
      if (input.projectId === null) return { snapshot: JSON.stringify({ entries: [] }) };
      query.andWhere("entry.project_id = :projectId", { projectId: input.projectId });
    }

    const entries = await query.getMany();
    return {
      snapshot: JSON.stringify({
        entries: entries.map((entry) => ({
          id: entry.id,
          project_id: entry.projectId,
          source_kind: entry.sourceKind,
          source_id: entry.pageId,
          title: entry.title,
          body: entry.searchText,
          trace_id: entry.traceId,
          updated_at: (entry.updatedAt ?? new Date(0)).toISOString(),
        })),
      }),
    };
  }

  private async normalizeSavedSearchProject(
    orgId: string,
    scope: "private" | "project" | "org",
    projectId?: string | null,
  ): Promise<string | null> {
    if (scope !== "project") return null;
    if (!projectId) {
      throw new SearchPublicValidationError("Project-scoped saved searches require project_id.");
    }
    await this.requireProjectInWorkspace(orgId, projectId);
    return projectId;
  }

  private async requireProjectInWorkspace(orgId: string, projectId: string): Promise<void> {
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({ id: projectId });
    if (!project || project.workspaceId !== orgId) {
      throw new SearchPublicValidationError("Project does not belong to this workspace.");
    }
  }
}

function toSearchHit(entry: KnowledgeWorkspaceSearchEntry, score: number): SearchHit {
  return {
    id: entry.id,
    source_kind: entry.sourceKind,
    source_id: entry.pageId,
    title: entry.title,
    body: entry.searchText,
    score,
    updated_at: (entry.updatedAt ?? new Date(0)).toISOString(),
  };
}

function toSavedSearchRow(row: KnowledgeWorkspaceSavedSearch): SavedSearchRow {
  return {
    id: row.id,
    org_id: row.workspaceId,
    user_id: row.userId,
    name: row.name,
    query_json: JSON.stringify(row.queryJson ?? {}),
    scope: row.scope as "private" | "project" | "org",
    project_id: row.projectId,
    created_at: (row.createdAt ?? new Date(0)).toISOString(),
    updated_at: (row.updatedAt ?? row.createdAt ?? new Date(0)).toISOString(),
  };
}
