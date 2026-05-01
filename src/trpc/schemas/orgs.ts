/**
 * Zod schemas for the orgs domain.
 * Pillar 9 (org management procedures) fills these out fully.
 */

import { z } from "zod";

/** Create org input — Pillar 9 extends. */
export const CreateOrgInputSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
});

/** Org member role — mirrors Better-Auth org plugin roles. */
export const OrgMemberRoleSchema = z.enum(["owner", "admin", "member", "guest"]);

export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;
export type OrgMemberRole = z.infer<typeof OrgMemberRoleSchema>;
