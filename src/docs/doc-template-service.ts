/**
 * DocTemplateService — token + interface for doc-template operations.
 *
 * Allows test callers to inject a mock implementation via needle-di container
 * without requiring a real EntityManager. Production code resolves the
 * EntityManagerDocTemplateService fallback when the token is not bound.
 *
 * C6: No raw SQL — queries happen in em-doc-template-service.ts via MikroORM.
 * C8: needle-di InjectionToken for DI.
 */

import { InjectionToken } from "@needle-di/core";
import type { DocType } from "../db/entities/docs/enums.ts";

// ─── Row shape ────────────────────────────────────────────────────────────────

export interface DocTemplateRow {
  id: string;
  orgId: string;
  projectId: string | null;
  docType: string;
  name: string;
  frontmatterTemplate: Record<string, unknown>;
  bodyTemplate: string;
  isDefault: boolean;
  createdAt: Date;
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface DocTemplateService {
  /**
   * List all templates for an org.
   * If projectId is supplied, returns project-specific + org-default templates.
   * If omitted, returns org-default templates.
   */
  list(orgId: string, projectId?: string | null): Promise<DocTemplateRow[]>;

  /**
   * Resolve the best template for a given org + project + docType.
   * Project-specific template (if any) takes precedence over org default.
   * Implementations may return immutable built-in defaults when no DB row exists.
   */
  resolve(
    orgId: string,
    projectId: string | null,
    docType: DocType,
  ): Promise<DocTemplateRow | null>;
}

// ─── DI token ────────────────────────────────────────────────────────────────

export const DOC_TEMPLATE_SERVICE_TOKEN = new InjectionToken<DocTemplateService>(
  "DocTemplateService",
);
