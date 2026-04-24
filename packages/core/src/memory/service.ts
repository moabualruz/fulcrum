import { existsSync } from "node:fs";
import { redactText, evaluatePolicy } from "@fulcrum/policy";
import {
  makeId,
  MemoryEntrySchema,
  SCHEMA_VERSION,
  type MemoryEntry,
  type PolicyDecision
} from "@fulcrum/shared";
import {
  EngramMemoryAdapter,
  MarkdownMemoryAdapter,
  MemsearchMemoryAdapter,
  type MemoryAdapter,
  type MemorySearchResult
} from "@fulcrum/memory";
import { exportMemoryWithProvenance, type MemoryExportRecord } from "./export.js";
import type { GraphLinkWriters } from "../graph/link-writers.js";
import type { InvalidationService } from "../readiness/invalidation-service.js";

export interface MemoryRepositoryPort {
  save(entry: MemoryEntry): MemoryEntry;
  get(memoryId: string): MemoryEntry | undefined;
  list(projectId?: string): MemoryEntry[];
}

export interface MemoryDraftInput {
  projectId: string;
  title: string;
  body: string;
  sourceRefs: MemoryEntry["sourceRefs"];
  linkedTaskIds?: string[];
  linkedRunIds?: string[];
  requester?: string;
}

export class MemoryService {
  private readonly adapters: Record<string, MemoryAdapter>;

  constructor(
    private readonly repository: MemoryRepositoryPort,
    adapters: MemoryAdapter[] = [
      new MarkdownMemoryAdapter(),
      new MemsearchMemoryAdapter(),
      new EngramMemoryAdapter()
    ],
    private readonly graphLinks?: GraphLinkWriters,
    private readonly invalidation?: InvalidationService
  ) {
    this.adapters = Object.fromEntries(adapters.map((adapter) => [adapter.backend, adapter]));
  }

  async import(input: {
    projectId: string;
    path: string;
    backend?: string;
  }): Promise<MemoryEntry[]> {
    const adapter = this.selectAdapter(input.backend);
    const entries = await adapter.import(input);
    return entries.map((entry) => this.repository.save(this.withRedaction(entry)));
  }

  async search(input: {
    projectId: string;
    query: string;
    backend?: string;
    limit?: number;
  }): Promise<MemorySearchResult[]> {
    const adapter = this.selectAdapter(input.backend);
    const entries = this.repository
      .list(input.projectId)
      .filter(
        (entry) =>
          entry.status !== "draft" && entry.status !== "deleted" && entry.status !== "archived"
      );
    const results = await adapter.search(input, entries);
    const health = adapter.health();
    return results.map((result) => ({
      ...result,
      limitation: result.limitation ?? health.limitation
    }));
  }

  draft(input: MemoryDraftInput): { entry: MemoryEntry; policyDecision: PolicyDecision } {
    const now = new Date().toISOString();
    const entry = this.repository.save(
      this.withRedaction(
        MemoryEntrySchema.parse({
          memoryId: makeId("mem", `${input.projectId}-${input.title}-${now}`),
          projectId: input.projectId,
          status: "draft",
          title: input.title,
          bodyRef: `draft://${makeId("draft", input.body)}`,
          excerpt: input.body.slice(0, 500),
          sourceRefs:
            input.sourceRefs.length > 0
              ? input.sourceRefs
              : [{ type: "missing", uri: "unavailable", label: "Source unavailable" }],
          linkedTaskIds: input.linkedTaskIds ?? [],
          linkedRunIds: input.linkedRunIds ?? [],
          backend: "markdown",
          freshness: "fresh",
          redactionStatus: "not_redacted",
          createdAt: now,
          updatedAt: now,
          schemaVersion: SCHEMA_VERSION
        })
      )
    );
    this.graphLinks?.memory(entry);
    return {
      entry,
      policyDecision: evaluatePolicy({
        action: "permanent_memory",
        subjectType: "memory",
        subjectId: entry.memoryId,
        requester: input.requester ?? "operator",
        preview: true,
        localOnly: true
      })
    };
  }

  approve(
    memoryId: string,
    input: { policyDecisionId?: string; requester?: string } = {}
  ): { entry?: MemoryEntry; policyDecision: PolicyDecision } {
    const current = this.repository.get(memoryId);
    const policyDecision = evaluatePolicy({
      action: "permanent_memory",
      subjectType: "memory",
      subjectId: memoryId,
      requester: input.requester ?? "operator",
      preview: false,
      localOnly: true
    });
    if (
      !current ||
      policyDecision.status !== "approval_required" ||
      input.policyDecisionId !== policyDecision.policyDecisionId
    ) {
      return { entry: current, policyDecision };
    }
    return {
      entry: this.saveWithGraph({
        ...current,
        status: "active",
        approvedBy: input.requester ?? "operator",
        updatedAt: new Date().toISOString()
      }),
      policyDecision: {
        ...policyDecision,
        status: "approved",
        nextAction: "Memory entry approved."
      }
    };
  }

  markStale(memoryId: string, reason = "Linked source missing or superseded."): MemoryEntry {
    const current = this.repository.get(memoryId);
    if (!current) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    return this.saveWithGraph({
      ...current,
      status: "stale",
      freshness: "stale",
      excerpt: current.excerpt
        ? `${current.excerpt}\n\nStale reason: ${reason}`
        : `Stale reason: ${reason}`,
      updatedAt: new Date().toISOString()
    });
  }

  private saveWithGraph(entry: MemoryEntry): MemoryEntry {
    const saved = this.repository.save(entry);
    this.graphLinks?.memory(saved);
    this.invalidation?.recordGenerated({
      derivedKind: "memory_index",
      rebuildSource: `memory:${saved.projectId}:${saved.memoryId}`,
      sourceRefs: saved.sourceRefs,
      toolVersion: "fulcrum-memory"
    });
    this.invalidation?.markMatchingStale({
      derivedKinds: ["graph_projection", "context_preview", "ranking"],
      rebuildSourceIncludes: saved.projectId,
      reason: "Memory entry changed."
    });
    return saved;
  }

  markStaleForMissingSources(projectId: string): MemoryEntry[] {
    return this.repository
      .list(projectId)
      .filter((entry) =>
        entry.sourceRefs.some(
          (ref) => ref.type === "file" && !existsSync(ref.uri.replace(/^file:\/\//, ""))
        )
      )
      .map((entry) => this.markStale(entry.memoryId, "Source file missing."));
  }

  export(projectId: string): MemoryExportRecord {
    return exportMemoryWithProvenance(this.repository.list(projectId));
  }

  list(projectId?: string): MemoryEntry[] {
    return this.repository.list(projectId);
  }

  private selectAdapter(backend = "markdown"): MemoryAdapter {
    return this.adapters[backend] ?? this.adapters.markdown ?? new MarkdownMemoryAdapter();
  }

  private withRedaction(entry: MemoryEntry): MemoryEntry {
    const title = redactText(entry.title);
    const excerpt = redactText(entry.excerpt ?? "");
    return {
      ...entry,
      title: title.text,
      excerpt: entry.excerpt ? excerpt.text : undefined,
      redactionStatus: title.redacted || excerpt.redacted ? "redacted" : entry.redactionStatus
    };
  }
}
