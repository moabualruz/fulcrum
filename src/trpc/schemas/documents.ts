/**
 * Zod schemas for the documents domain.
 * Pillar 7 (documents + wiki) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Document content type — Pillar 7 extends. */
export const DocumentTypeSchema = z.enum(["page", "wiki", "note", "template"]);

/** Minimal Document output schema — Pillar 7 extends with full field set. */
export const DocumentSchema = z.object({
  id: z.string().uuid().describe("Unique document identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the document."),
  title: z.string().describe("Human-readable document title."),
  type: DocumentTypeSchema.describe("Content type category for the document."),
  createdAt: z.date().describe("Timestamp when the document was created."),
});

/** Input for listing documents — Pillar 7 adds filters/pagination. */
export const ListDocumentsInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation. Omit for all accessible documents."),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type ListDocumentsInput = z.infer<typeof ListDocumentsInputSchema>;
