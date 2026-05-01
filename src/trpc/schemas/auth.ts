/**
 * Zod schemas for the auth domain.
 * Pillar 9 (auth tRPC procedures + org management) fills these out fully.
 * This file is the placeholder; downstream pillars add their procedure input/output schemas here.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Minimal User output schema — Pillar 9 extends. */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullish(),
  createdAt: z.date(),
});

/** Minimal Org output schema — Pillar 9 extends. */
export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date(),
});

/** WhoAmI response — auth.whoami procedure output. */
export const WhoAmISchema = z.object({
  user: UserSchema,
  org: OrgSchema,
  role: z.string(),
});

export type User = z.infer<typeof UserSchema>;
export type Org = z.infer<typeof OrgSchema>;
export type WhoAmI = z.infer<typeof WhoAmISchema>;
