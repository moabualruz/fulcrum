/**
 * Gated memory-cluster digest.
 *
 * OFF by default; enabled via FULCRUM_FEATURES=report-llm-narration.
 * Summarizes a project's memory cluster over a date range via the inference
 * sidecar `summarize(memories[]) → string`. Output stored as a Doc entity
 * with docType='note' and sourceRef = { kind: 'memory_digest', project_id, since }.
 *
 * Triggered two ways:
 *   1. `fulcrum memory digest --project <id> [--since <date>]` CLI command
 *   2. Weekly graphile-worker cron job (Monday 00:00 UTC per org; skipped if < 10 memories)
 *
 * The job is feature-flagged and always scoped by organization.
 */

import type { EntityManager } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";

// ── Types ─────────────────────────────────────────────────────────────────

export interface InferenceClientLike {
  call(method: string, params: unknown): Promise<unknown>;
}

export interface DigestResult {
  docId: string;
  body: string;
  projectId: string;
  since: string;
}

// ── Feature flag ──────────────────────────────────────────────────────────

const DIGEST_FLAG = "report-llm-narration";

export function isDigestEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .some((f) => f === DIGEST_FLAG || f.startsWith(`${DIGEST_FLAG}:`));
}

// ── Digest job ───────────────────────────────────────────────────────────

const MIN_MEMORIES_FOR_CRON = 10;
const DEFAULT_WINDOW_DAYS = 7;

export class MemoryDigestJob {
  constructor(
    private readonly em: EntityManager,
    private readonly client: InferenceClientLike,
    private readonly onWarning: (msg: string) => void = console.warn,
  ) {}

  /**
   * Run digest for a project. Returns DigestResult on success, null if
   * feature disabled or insufficient memories for cron mode.
   *
   * @param orgId - Organization ID
   * @param projectId - Project ID
   * @param since - Date filter for memories (default: 7 days ago)
   * @param cronMode - When true, skip if < 10 memories in window
   */
  async run(
    orgId: string,
    projectId: string,
    since?: Date,
    cronMode = false,
  ): Promise<DigestResult | null> {
    if (!isDigestEnabled()) {
      throw new Error("feature not enabled");
    }

    const sinceDate = since ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Fetch memories in window
    const { MoreThanOrEqual } = await import("typeorm");
    const memories = await this.em.find(Memory, {
      where: {
        org: { id: orgId },
        projectId,
        createdAt: MoreThanOrEqual(sinceDate),
        archived: false,
      } as never,
      order: { createdAt: "ASC" },
    });

    // Cron mode: skip if < 10 memories
    if (cronMode && memories.length < MIN_MEMORIES_FOR_CRON) {
      return null;
    }

    if (memories.length === 0) {
      return null;
    }

    // Call sidecar summarize
    let summary: string;
    try {
      const result = await this.client.call("summarize", {
        memories: memories.map((m) => ({ body: m.body, kind: m.kind, importance: m.importance })),
      });
      const parsed = result as { summary: string };
      summary = parsed.summary ?? "";
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.onWarning(`Memory digest failed (sidecar): ${msg}`);
      throw error;
    }

    if (!summary) {
      this.onWarning("Memory digest: sidecar returned empty summary");
      throw new Error("sidecar returned empty summary");
    }

    // Write doc
    const orgRef = { id: orgId } as Org;
    const doc = this.em.create(Document, {
      org: orgRef,
      projectId,
      docType: "note" as const,
      scope: "project" as const,
      bodyMd: summary,
      frontmatter: {
        source_ref: {
          kind: "memory_digest",
          project_id: projectId,
          since: sinceDate.toISOString(),
        },
      },
      contentJson: {},
      sortPosition: 0,
      archived: false,
      updatedAt: new Date(),
    });
    await this.em.save(doc);

    return {
      docId: doc.id,
      body: summary,
      projectId,
      since: sinceDate.toISOString(),
    };
  }
}

// ── Cron registration ────────────────────────────────────────────────────

export const CRON_JOB_KIND = "memory_digest_weekly";
export const CRON_SCHEDULE = "0 0 * * 1"; // Monday 00:00 UTC

export function isCronRegisterable(): boolean {
  return isDigestEnabled();
}

// ── Doctor check ─────────────────────────────────────────────────────────

export interface DoctorCheckResult {
  subsystem: string;
  status: "ok" | "disabled" | "degraded";
}

export function digestDoctorCheck(): DoctorCheckResult {
  return {
    subsystem: "report_narration",
    status: isDigestEnabled() ? "ok" : "disabled",
  };
}
