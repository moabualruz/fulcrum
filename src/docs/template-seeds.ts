/**
 * Static org-default template seed definitions.
 *
 * These are the canonical bodies/frontmatter for the 9 built-in doc_types.
 * Used by:
 *   - Migration20260502100000_doc_templates_seed (seed migration)
 *   - Web docs/new load() (pre-populate the new-doc wizard without a DB round-trip)
 *
 * Frontmatter keys match the required fields in the Zod schemas in frontmatter-schemas.ts.
 * Body templates are plain markdown strings (not TipTap JSON).
 */

import type { DocType } from "../db/entities/docs/enums.ts";

export interface TemplateSeed {
  docType: DocType;
  name: string;
  frontmatterTemplate: Record<string, unknown>;
  bodyTemplate: string;
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    docType: "spec",
    name: "Default spec",
    frontmatterTemplate: { status: "draft" },
    bodyTemplate:
      "# Spec Title\n\n## Overview\n\n## Requirements\n\n## Out of Scope\n",
  },
  {
    docType: "adr",
    name: "Default adr",
    frontmatterTemplate: {
      status: "proposed",
      decision: "",
      context: "",
      consequences: "",
    },
    bodyTemplate:
      "# ADR Title\n\n## Context\n\n## Decision\n\n## Consequences\n",
  },
  {
    docType: "wiki",
    name: "Default wiki",
    frontmatterTemplate: {},
    bodyTemplate: "# Wiki Page\n\n## Overview\n\n## Details\n",
  },
  {
    docType: "runbook",
    name: "Default runbook",
    frontmatterTemplate: { service: "", severity_level: "p2" },
    bodyTemplate:
      "# Runbook Title\n\n## Service\n\n## Severity\n\n## Steps\n\n## Escalation\n",
  },
  {
    docType: "meeting",
    name: "Default meeting",
    frontmatterTemplate: { date: "1970-01-01T00:00:00Z", attendees: [] },
    bodyTemplate:
      "# Meeting Notes\n\n## Attendees\n\n## Agenda\n\n## Notes\n\n## Action Items\n",
  },
  {
    docType: "postmortem",
    name: "Default postmortem",
    frontmatterTemplate: {
      impact: "",
      timeline: "",
      root_cause: "",
      action_items: [],
    },
    bodyTemplate:
      "# Postmortem\n\n## Impact\n\n## Timeline\n\n## Root Cause\n\n## Action Items\n",
  },
  {
    docType: "rfc",
    name: "Default rfc",
    frontmatterTemplate: { status: "draft", summary: "" },
    bodyTemplate:
      "# RFC Title\n\n## Summary\n\n## Motivation\n\n## Proposal\n\n## Alternatives\n",
  },
  {
    docType: "note",
    name: "Default note",
    frontmatterTemplate: {},
    bodyTemplate: "# Note Title\n\n",
  },
  {
    docType: "scratch",
    name: "Default scratch",
    frontmatterTemplate: {},
    bodyTemplate: "",
  },
];

/**
 * Template bodies keyed by doc_type.
 * Useful for web wizard pre-population without a DB query.
 */
export const TEMPLATE_BODY_MAP: Record<DocType, string> = Object.fromEntries(
  TEMPLATE_SEEDS.map((s) => [s.docType, s.bodyTemplate]),
) as Record<DocType, string>;
