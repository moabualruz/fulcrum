/**
 * Zod schemas for the orgs domain.
 * Pillar 9 (org management procedures) — fully implemented.
 */

import { z } from "zod";

/** Org member role — mirrors Better-Auth org plugin roles. */
export const OrgMemberRoleSchema = z.enum(["owner", "admin", "member", "guest"]);

/** Create org input — Pillar 9. */
export const CreateOrgInputSchema = z.object({
  name: z.string().min(1).max(128).describe("Human-readable organisation name."),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).describe("URL-safe organisation slug, lowercase alphanumeric with hyphens."),
});

/** orgs.update input */
export const UpdateOrgInputSchema = z.object({
  name: z.string().min(1).max(128).describe("New human-readable organisation name."),
});

/** orgs.members.updateRole input */
export const UpdateMemberRoleInputSchema = z.object({
  userId: z.string().uuid().describe("User whose role should be updated."),
  role: OrgMemberRoleSchema.describe("New role to assign to the member."),
});

/** orgs.members.remove input */
export const RemoveMemberInputSchema = z.object({
  userId: z.string().uuid().describe("User to remove from the organisation."),
});

/** OrgMember output shape */
export const OrgMemberSchema = z.object({
  id: z.string().uuid().describe("Unique membership record identifier."),
  userId: z.string().uuid().describe("Identifier of the member user."),
  orgId: z.string().uuid().describe("Identifier of the organisation."),
  role: OrgMemberRoleSchema.describe("Member's role within the organisation."),
  joinedAt: z.date().describe("Timestamp when the user joined the organisation."),
});

/** Org output shape */
export const OrgOutputSchema = z.object({
  id: z.string().uuid().describe("Unique organisation identifier."),
  name: z.string().describe("Human-readable organisation name."),
  slug: z.string().describe("URL-safe organisation slug."),
  createdAt: z.date().describe("Timestamp when the organisation was created."),
  updatedAt: z.date().describe("Timestamp when the organisation was last updated."),
});

export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgInputSchema>;
export type OrgMemberRole = z.infer<typeof OrgMemberRoleSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInputSchema>;
export type RemoveMemberInput = z.infer<typeof RemoveMemberInputSchema>;
export type OrgMember = z.infer<typeof OrgMemberSchema>;
export type OrgOutput = z.infer<typeof OrgOutputSchema>;
