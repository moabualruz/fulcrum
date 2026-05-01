/**
 * Zod schemas for the orgs domain.
 * Pillar 9 (org management procedures) — fully implemented.
 */

import { z } from "zod";

/** Org member role — mirrors Better-Auth org plugin roles. */
export const OrgMemberRoleSchema = z.enum(["owner", "admin", "member", "guest"]);

/** Create org input — Pillar 9. */
export const CreateOrgInputSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
});

/** orgs.update input */
export const UpdateOrgInputSchema = z.object({
  name: z.string().min(1).max(128),
});

/** orgs.members.updateRole input */
export const UpdateMemberRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: OrgMemberRoleSchema,
});

/** orgs.members.remove input */
export const RemoveMemberInputSchema = z.object({
  userId: z.string().uuid(),
});

/** OrgMember output shape */
export const OrgMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: OrgMemberRoleSchema,
  joinedAt: z.date(),
});

/** Org output shape */
export const OrgOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgInputSchema>;
export type OrgMemberRole = z.infer<typeof OrgMemberRoleSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInputSchema>;
export type RemoveMemberInput = z.infer<typeof RemoveMemberInputSchema>;
export type OrgMember = z.infer<typeof OrgMemberSchema>;
export type OrgOutput = z.infer<typeof OrgOutputSchema>;
