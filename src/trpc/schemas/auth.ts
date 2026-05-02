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
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullish(),
  createdAt: z.date(),
});

/** Minimal Org output schema. */
export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date(),
});

/** WhoAmI response — auth.whoami procedure output. */
export const WhoAmISchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  email: z.string().email(),
  role: z.string(),
});

/** auth.invite input */
export const InviteInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member", "guest"]).default("member"),
});

/** auth.invite output */
export const InviteOutputSchema = z.object({
  invitationId: z.string().uuid(),
  /** Plaintext token — returned ONCE at creation; stored hashed in DB. */
  token: z.string(),
});

/** auth.acceptInvite input */
export const AcceptInviteInputSchema = z.object({
  /** Plaintext token from the invitation email. */
  token: z.string().min(1),
  /** Optional name for the accepting user. */
  name: z.string().nullish(),
});

/** auth.acceptInvite output */
export const AcceptInviteOutputSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type User = z.infer<typeof UserSchema>;
export type Org = z.infer<typeof OrgSchema>;
export type WhoAmI = z.infer<typeof WhoAmISchema>;
export type InviteInput = z.infer<typeof InviteInputSchema>;
export type InviteOutput = z.infer<typeof InviteOutputSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;
export type AcceptInviteOutput = z.infer<typeof AcceptInviteOutputSchema>;
