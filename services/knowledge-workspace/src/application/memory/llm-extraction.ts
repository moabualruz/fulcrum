/**
 * Gated LLM-driven memory extractor.
 *
 * OFF by default; enabled via FULCRUM_FEATURES=memory-llm-extract.
 * Runs in parallel to heuristic extractor after after_run / after_doc_save
 * events. Calls the inference sidecar extract_facts(text) → Fact[].
 *
 * Dedup: checks existing memories for same (org_id, project_id) with
 * pg_trgm similarity() > 0.85 — skips near-duplicates.
 *
 * Job timeout: 30s. Retry: 2× on non-timeout failure. Fails silently
 * if sidecar down (logs warning; heuristic rows remain).
 *
 * The extractor is feature-flagged, organization-scoped, and writes source='llm'.
 */

import type { EntityManager } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { MemoryLink } from "@knowledge-workspace/infrastructure/database/entities/memory/MemoryLink.ts";
import type { MemoryImportance, MemoryKind, MemoryLinkTargetKind } from "@knowledge-workspace/infrastructure/database/entities/memory/enums.ts";

// ── Types ─────────────────────────────────────────────────────────────────

export interface Fact {
  body: string;
  kind: string;
  importance: string;
  confidence: number;
}

export interface InferenceClientLike {
  callCount?: number;
  call(method: string, params: unknown): Promise<unknown>;
}

// ── Feature flag ──────────────────────────────────────────────────────────

const LLM_EXTRACT_FLAG = "memory-llm-extract";

export function isLlmExtractEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .includes(LLM_EXTRACT_FLAG);
}

// ── Dedup ─────────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Check if a near-duplicate memory exists for the same org/project scope.
 * Uses pg_trgm similarity() when available; falls back to exact-match check
 * (PGlite may not have pg_trgm extension loaded).
 */
async function isDuplicate(
  em: EntityManager,
  orgId: string,
  projectId: string | null,
  body: string,
): Promise<boolean> {
  // Try pg_trgm similarity first
  try {
    const result = await em.query(
      `SELECT 1 FROM memories
       WHERE org_id = ? AND (project_id = ? OR project_id IS NULL)
         AND similarity(body, ?) > ?
       LIMIT 1`,
      [orgId, projectId, body, SIMILARITY_THRESHOLD],
    );
    return Array.isArray(result) && result.length > 0;
  } catch {
    // pg_trgm not available — fall back to exact match
    const existing = await em.findOne(Memory, {
      org: { id: orgId },
      body,
    } as never);
    return existing !== null;
  }
}

// ── Job ───────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

export class LlmExtractionJob {
  readonly timeoutMs = 30_000;

  constructor(
    private readonly em: EntityManager,
    private readonly client: InferenceClientLike,
    private readonly onWarning: (msg: string) => void = console.warn,
  ) {}

  async run(
    orgId: string,
    projectId: string | null,
    text: string,
    targetId: string,
    targetKind: MemoryLinkTargetKind,
  ): Promise<void> {
    if (!isLlmExtractEnabled()) return;

    let facts: Fact[];
    try {
      facts = await this.callWithRetry(text);
    } catch (error) {
      // Fail silently — heuristic rows remain
      const msg = error instanceof Error ? error.message : String(error);
      this.onWarning(`LLM extraction failed (sidecar): ${msg}`);
      return;
    }

    if (!facts || facts.length === 0) return;

    const orgRef = { id: orgId } as Org;
    const now = new Date();

    for (const fact of facts) {
      // Dedup check
      if (await isDuplicate(this.em, orgId, projectId, fact.body)) {
        continue;
      }

      const validKind = validMemoryKind(fact.kind);
      const validImportance = validMemoryImportance(fact.importance);

      const memory = this.em.create(Memory, {
        org: orgRef,
        projectId,
        kind: validKind,
        body: fact.body,
        source: "llm" as const,
        importance: validImportance,
        tags: [],
        global: false,
        archived: false,
        sourceRef: {
          confidence: fact.confidence,
          target_id: targetId,
          target_kind: targetKind,
        },
        createdAt: now,
        updatedAt: now,
      });
      await this.em.save(memory);

      const link = this.em.create(MemoryLink, {
        org: orgRef,
        memory,
        targetKind,
        targetId,
      });
      await this.em.save(link);
    }
  }

  private async callWithRetry(text: string): Promise<Fact[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await Promise.race([
          this.client.call("extract_facts", { text }),
          timeoutPromise(this.timeoutMs),
        ]);
        const parsed = result as { facts: Fact[] };
        return parsed.facts ?? [];
      } catch (error) {
        lastError = error;

        // No retry on timeout
        if (isTimeoutError(error)) {
          throw error;
        }

        // Last attempt — give up
        if (attempt >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    throw lastError;
  }
}

// ── Doctor check ──────────────────────────────────────────────────────────

export interface DoctorCheckResult {
  subsystem: string;
  status: "ok" | "disabled" | "degraded";
}

export function llmExtractionDoctorCheck(): DoctorCheckResult {
  return {
    subsystem: "llm_extraction",
    status: isLlmExtractEnabled() ? "ok" : "disabled",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const VALID_KINDS = new Set(["note", "decision", "blocker", "file_ref", "section_anchor", "link", "fact"]);
const VALID_IMPORTANCES = new Set(["low", "medium", "high"]);

function validMemoryKind(kind: string): MemoryKind {
  return VALID_KINDS.has(kind) ? (kind as MemoryKind) : "fact";
}

function validMemoryImportance(importance: string): MemoryImportance {
  return VALID_IMPORTANCES.has(importance) ? (importance as MemoryImportance) : "medium";
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code === "ETIMEDOUT";
  }
  return error instanceof Error && error.message.includes("timed out");
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error(`timed out after ${ms}ms`);
      (err as Error & { code?: string }).code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });
}
