import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { makeId, type CodeEvidence, CodeEvidenceSchema, type Project } from "@fulcrum/shared";
import { loadIgnoredPathPolicy, loadIgnoredPathPolicySync } from "../privacy/ignored-paths.js";
import type { GraphLinkWriters } from "../graph/link-writers.js";
import {
  collectRepoFingerprint,
  type InvalidationService
} from "../readiness/invalidation-service.js";

export interface CodeSearchAdapter {
  search(options: {
    rootPath: string;
    query: string;
    ignorePolicy: { isIgnored(candidatePath: string): boolean };
    limit: number;
  }): Promise<
    Array<{
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      symbol?: string;
      evidenceType: CodeEvidence["evidenceType"];
      sourceTool: string;
      reason: string;
    }>
  >;
}

export interface CodeEvidenceRepositoryPort {
  save(evidence: CodeEvidence): CodeEvidence;
  list(projectId: string): CodeEvidence[];
  markStale(evidenceId: string, staleAt: string): CodeEvidence | undefined;
}

export interface CodeProjectRepositoryPort {
  get(projectId: string): Project | undefined;
}

export interface CodeSearchResult {
  query: string;
  projectId: string;
  rootPath: string;
  count: number;
  ignoredPathBehavior: {
    status: "honored";
    sources: string[];
    excludedPatterns: number;
  };
  degraded: Array<{ capabilityId: string; state: string; nextAction: string }>;
  evidence: CodeEvidence[];
}

export class CodeEvidenceService {
  constructor(
    private readonly projects: CodeProjectRepositoryPort,
    private readonly repository: CodeEvidenceRepositoryPort,
    private readonly exactAdapter: CodeSearchAdapter,
    private readonly semanticSearch: () => Promise<{
      state: string;
      capabilityId: "cap_semantic_code";
      nextAction: string;
    }>,
    private readonly graphLinks?: GraphLinkWriters,
    private readonly invalidation?: InvalidationService,
    private readonly structuralAdapter?: CodeSearchAdapter
  ) {}

  async search(input: {
    projectId: string;
    query: string;
    limit?: number;
    includeSemantic?: boolean;
  }): Promise<CodeSearchResult> {
    return this.runSearch(
      input,
      this.exactAdapter,
      `code-search:${input.projectId}:${input.query}`
    );
  }

  async structural(input: {
    projectId: string;
    pattern: string;
    limit?: number;
  }): Promise<CodeSearchResult> {
    if (!this.structuralAdapter) {
      const project = this.projects.get(input.projectId);
      if (!project) {
        throw new Error(`Unknown project: ${input.projectId}`);
      }
      return {
        query: input.pattern,
        projectId: project.projectId,
        rootPath: project.rootPath,
        count: 0,
        ignoredPathBehavior: {
          status: "honored",
          sources: [],
          excludedPatterns: 0
        },
        degraded: [
          {
            capabilityId: "cap_ast_grep",
            state: "degraded",
            nextAction: "Install ast-grep to enable structural code search."
          }
        ],
        evidence: []
      };
    }
    try {
      return await this.runSearch(
        { projectId: input.projectId, query: input.pattern, limit: input.limit },
        this.structuralAdapter,
        `structural-search:${input.projectId}:${input.pattern}`
      );
    } catch (error) {
      const project = this.projects.get(input.projectId);
      if (!project) throw error;
      const ignorePolicy = await loadIgnoredPathPolicy(project.rootPath);
      return {
        query: input.pattern,
        projectId: project.projectId,
        rootPath: project.rootPath,
        count: 0,
        ignoredPathBehavior: {
          status: "honored",
          sources: ignorePolicy.sources,
          excludedPatterns: ignorePolicy.patterns.length
        },
        degraded: [
          {
            capabilityId: "cap_ast_grep",
            state: "degraded",
            nextAction:
              error instanceof Error
                ? error.message
                : "Install ast-grep to enable structural code search."
          }
        ],
        evidence: []
      };
    }
  }

  private async runSearch(
    input: {
      projectId: string;
      query: string;
      limit?: number;
      includeSemantic?: boolean;
    },
    adapter: CodeSearchAdapter,
    rebuildSource: string
  ): Promise<CodeSearchResult> {
    if (input.query.trim().length === 0) {
      throw new Error("Code search query must not be empty.");
    }
    const project = this.projects.get(input.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${input.projectId}`);
    }
    if (!existsSync(project.rootPath)) {
      return {
        query: input.query,
        projectId: project.projectId,
        rootPath: project.rootPath,
        count: 0,
        ignoredPathBehavior: {
          status: "honored",
          sources: [],
          excludedPatterns: 0
        },
        degraded: [
          {
            capabilityId: "cap_code_search",
            state: "degraded",
            nextAction: `Restore missing project root: ${project.rootPath}.`
          }
        ],
        evidence: []
      };
    }
    const started = Date.now();
    const ignorePolicy = await loadIgnoredPathPolicy(project.rootPath);
    const limit = normalizeLimit(input.limit);
    const raw = await adapter.search({
      rootPath: project.rootPath,
      query: input.query,
      ignorePolicy,
      limit
    });
    const now = new Date().toISOString();
    const evidence = raw.map((result, index) =>
      this.repository.save(
        CodeEvidenceSchema.parse({
          evidenceId: makeId(
            "evid",
            `${project.projectId}:${input.query}:${result.filePath}:${result.lineStart ?? 0}:${index}`
          ),
          projectId: project.projectId,
          query: input.query,
          evidenceType: result.evidenceType,
          filePath: result.filePath,
          lineStart: result.lineStart,
          lineEnd: result.lineEnd,
          symbol: result.symbol,
          sourceTool: result.sourceTool,
          ignoredPathStatus: ignorePolicy.patterns.length > 0 ? "honored" : "not_ignored",
          freshness: "fresh",
          rank: index,
          reason: result.reason,
          durationMs: Date.now() - started,
          linkedContextItemIds: [],
          createdAt: now
        })
      )
    );
    for (const item of evidence) {
      this.graphLinks?.code(item);
    }
    this.invalidation?.recordGenerated({
      derivedKind: "code_evidence",
      rebuildSource,
      sourceRefs: evidence.map((item) => ({
        type: "file",
        uri: item.filePath,
        label: item.symbol ?? item.query,
        lineStart: item.lineStart,
        lineEnd: item.lineEnd
      })),
      ...collectRepoFingerprint(project.rootPath, "fulcrum-code-evidence")
    });
    const degraded = input.includeSemantic
      ? [
          await this.semanticSearch().then((semantic) => ({
            capabilityId: semantic.capabilityId,
            state: semantic.state,
            nextAction: semantic.nextAction
          }))
        ]
      : [];
    return {
      query: input.query,
      projectId: project.projectId,
      rootPath: project.rootPath,
      count: evidence.length,
      ignoredPathBehavior: {
        status: "honored",
        sources: ignorePolicy.sources,
        excludedPatterns: ignorePolicy.patterns.length
      },
      degraded,
      evidence
    };
  }

  cleanupStale(projectId: string): CodeEvidence[] {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    const staleAt = new Date().toISOString();
    const ignorePolicy = loadIgnoredPathPolicySync(project.rootPath);
    const stale = this.repository
      .list(projectId)
      .filter((item) => !item.staleAt && this.isStale(project, item, ignorePolicy))
      .map((item) => this.repository.markStale(item.evidenceId, staleAt))
      .filter((item): item is CodeEvidence => Boolean(item));
    for (const item of stale) {
      this.graphLinks?.code(item);
    }
    if (stale.length > 0) {
      this.invalidation?.markMatchingStale({
        derivedKinds: ["code_evidence", "graph_projection", "context_preview", "ranking"],
        rebuildSourceIncludes: project.projectId,
        reason: "Code evidence source missing, ignored, or changed."
      });
    }
    return stale;
  }

  private isStale(
    project: Project,
    evidence: CodeEvidence,
    ignorePolicy: { isIgnored(candidatePath: string): boolean }
  ): boolean {
    const absolutePath = path.join(project.rootPath, evidence.filePath);
    if (!existsSync(absolutePath) || ignorePolicy.isIgnored(absolutePath)) {
      return true;
    }
    if (evidence.evidenceType === "path" || evidence.evidenceType === "filename") {
      return !evidence.filePath.toLowerCase().includes(evidence.query.toLowerCase());
    }
    if (evidence.evidenceType === "structural") {
      return false;
    }
    let body: string;
    try {
      body = readFileSync(absolutePath, "utf8");
    } catch {
      return true;
    }
    if (evidence.lineStart) {
      const currentLine = body.split(/\r?\n/)[evidence.lineStart - 1];
      return !currentLine?.includes(evidence.query);
    }
    return !body.includes(evidence.query);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit < 1) {
    return 50;
  }
  return Math.min(Math.floor(limit), 200);
}
