/**
 * AfterDocSaveMemoryHook — heuristic extraction triggered on doc save.
 *
 * Receives doc body + frontmatter from the document save event, runs three
 * extraction passes, persists Memory + MemoryLink entities.
 *
 * Three passes:
 *   1. Frontmatter keys (decisions|blockers|links|status|tags) → one Memory per value
 *   2. Lists under ## Decisions / ## Blockers / ## Action Items → one Memory per bullet
 *   3. Wikilinks [[...]] in body → kind='link'
 *
 * Idempotent: composite upsert on (org_id, project_id, kind, body, source) prevents
 * duplicate rows when the same doc is saved multiple times.
 *
 * The hook itself is always built; writes stay scoped by org_id and project_id.
 */

import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { MemoryLink } from "@knowledge-workspace/infrastructure/database/entities/memory/MemoryLink.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { MemoryImportance, MemoryKind } from "@knowledge-workspace/infrastructure/database/entities/memory/enums.ts";

export interface DocSaveCtx {
  orgId: string;
  projectId: string;
}

interface ExtractionCandidate {
  kind: MemoryKind;
  body: string;
  importance: MemoryImportance;
}

/** Frontmatter key → memory kind mapping for Pass 1. */
const FM_KEY_KIND: Record<string, MemoryKind> = {
  decisions: "decision",
  blockers: "blocker",
  links: "link",
  status: "note",
  tags: "note",
};

/** Heading text → memory kind mapping for Pass 2. */
const HEADING_KIND: Record<string, MemoryKind> = {
  decisions: "decision",
  blockers: "blocker",
  "action items": "note",
};

/** Headings whose memory rows get importance=high. */
const HIGH_IMPORTANCE_KINDS = new Set<MemoryKind>(["decision", "blocker"]);

@Injectable()
export class AfterDocSaveMemoryHook {
  constructor(
    private readonly em: EntityManager,
  ) {}

  async handle(
    docId: string,
    body: string,
    frontmatter: Record<string, unknown>,
    ctx: DocSaveCtx,
  ): Promise<void> {
    const candidates: ExtractionCandidate[] = [
      ...extractFrontmatter(frontmatter),
      ...extractHeadingSections(body),
      ...extractWikilinks(body),
    ];

    if (candidates.length === 0) return;

    const orgRef = { id: ctx.orgId } as Org;
    const now = new Date();

    for (const candidate of candidates) {
      // Find-or-create Memory — idempotent by (org, projectId, kind, body, source='heuristic').
      // MikroORM's upsert onConflictWhere places the WHERE after DO NOTHING instead of
      // before it (partial-index arbiter syntax), which PGlite rejects. Use find-then-create
      // instead; the partial index on memories still enforces uniqueness at the DB level.
      let memory = await (this.em as EntityManager).findOne(Memory, {
        org: { id: ctx.orgId },
        projectId: ctx.projectId,
        kind: candidate.kind,
        body: candidate.body,
        source: "heuristic",
      } as never);

      if (!memory) {
        memory = (this.em as EntityManager).create(Memory, {
          org: orgRef,
          projectId: ctx.projectId,
          kind: candidate.kind,
          body: candidate.body,
          source: "heuristic" as const,
          importance: candidate.importance,
          tags: [],
          global: false,
          archived: false,
          sourceRef: {},
          createdAt: now,
          updatedAt: now,
        });
        await (this.em as EntityManager).save(memory);
      }

      // Find-or-create MemoryLink — idempotent by (memory, targetKind, targetId).
      const existingLink = await (this.em as EntityManager).findOne(MemoryLink, {
        where: {
          memory: { id: memory.id },
          targetKind: "doc",
          targetId: docId,
        } as never,
      });

      if (!existingLink) {
        const link = (this.em as EntityManager).create(MemoryLink, {
          org: orgRef,
          memory,
          targetKind: "doc" as const,
          targetId: docId,
        });
        await (this.em as EntityManager).save(link);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(
  frontmatter: Record<string, unknown>,
): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    const kind = FM_KEY_KIND[key.toLowerCase()];
    if (!kind) continue;

    const importance: MemoryImportance =
      kind === "decision" || kind === "blocker" ? "high" : "medium";

    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      const body = String(v).trim();
      if (body === "") continue;
      results.push({ kind, body, importance });
    }
  }

  return results;
}

function extractHeadingSections(body: string): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  if (!body.trim()) return results;

  const lines = body.split(/\r?\n/);
  let currentKind: MemoryKind | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect ## or ### heading that matches our list
    const headingMatch = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (headingMatch) {
      const headingText = headingMatch[1]?.toLowerCase() ?? "";
      currentKind = HEADING_KIND[headingText] ?? null;
      continue;
    }

    // Once we hit another heading (not in our map), stop
    if (/^#{1,6}\s/.test(trimmed)) {
      currentKind = null;
      continue;
    }

    if (currentKind === null) continue;

    // Bullet lines under a tracked heading
    const bulletMatch = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bulletMatch) {
      const bulletText = bulletMatch[1]?.trim();
      if (!bulletText) continue;
      const importance: MemoryImportance = HIGH_IMPORTANCE_KINDS.has(currentKind)
        ? "high"
        : "medium";
      results.push({ kind: currentKind, body: bulletText, importance });
    }
  }

  return results;
}

function extractWikilinks(body: string): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  for (const match of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const text = match[1]?.trim();
    if (!text) continue;
    results.push({ kind: "link", body: text, importance: "medium" });
  }
  return results;
}
