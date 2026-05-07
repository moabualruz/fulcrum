/**
 * Zod schemas for the auth domain.
 * Pillar 9 (auth tRPC procedures + org management) — fully implemented.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Minimal User output schema. */
export const UserSchema = z.object({
  id: z.string().uuid().describe("Unique user identifier."),
  email: z.string().email().describe("User's email address."),
  name: z.string().nullish().describe("Optional display name for the user."),
  createdAt: z.date().describe("Timestamp when the user was created."),
});

/** Minimal Org output schema. */
export const OrgSchema = z.object({
  id: z.string().uuid().describe("Unique organisation identifier."),
  name: z.string().describe("Human-readable organisation name."),
  slug: z.string().describe("URL-safe organisation slug."),
  createdAt: z.date().describe("Timestamp when the organisation was created."),
});

/** WhoAmI response — auth.whoami procedure output. */
export const WhoAmISchema = z.object({
  userId: z.string().describe("Authenticated user identifier."),
  orgId: z.string().describe("Active organisation identifier for this session."),
  email: z.string().email().describe("Authenticated user's email address."),
  role: z.string().describe("User's role within the active organisation."),
});

/** auth.invite input */
export const InviteInputSchema = z.object({
  email: z.string().email().describe("Email address of the person to invite."),
  role: z.enum(["owner", "admin", "member", "guest"]).default("member").describe("Role to assign to the invited user."),
});

/** auth.invite output */
export const InviteOutputSchema = z.object({
  invitationId: z.string().uuid().describe("Unique identifier for the created invitation."),
  /** Plaintext token — returned ONCE at creation; stored hashed in DB. */
  token: z.string().describe("Plaintext invitation token returned once at creation; stored hashed in DB."),
});

/** auth.acceptInvite input */
export const AcceptInviteInputSchema = z.object({
  /** Plaintext token from the invitation email. */
  token: z.string().min(1).describe("Plaintext token from the invitation email."),
  /** Optional name for the accepting user. */
  name: z.string().nullish().describe("Optional display name for the new user."),
});

/** auth.acceptInvite output */
export const AcceptInviteOutputSchema = z.object({
  userId: z.string().uuid().describe("Identifier of the newly created or matched user."),
  orgId: z.string().uuid().describe("Organisation the user has joined."),
});

export type User = z.infer<typeof UserSchema>;
export type Org = z.infer<typeof OrgSchema>;
export type WhoAmI = z.infer<typeof WhoAmISchema>;
export type InviteInput = z.infer<typeof InviteInputSchema>;
export type InviteOutput = z.infer<typeof InviteOutputSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;
export type AcceptInviteOutput = z.infer<typeof AcceptInviteOutputSchema>;
