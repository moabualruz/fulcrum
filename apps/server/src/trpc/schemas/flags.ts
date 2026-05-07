/**
 * Zod schemas for the feature-flags domain.
 * Pillar 7 (feature-flag registry) fills these out fully.
 *
 * D5: Flag names are lowercase-with-hyphens; enforced by the regex validator.
 */

import { z } from "zod";

/** D5: Flag name format — lowercase-with-hyphens. */
export const FlagNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/).describe("Flag name in lowercase-with-hyphens format, e.g. my-feature.");

/** FeatureFlag row output schema. */
export const FeatureFlagSchema = z.object({
  id: z.string().uuid().describe("Unique feature flag identifier."),
  flag: FlagNameSchema.describe("Flag name in lowercase-with-hyphens format."),
  enabled: z.boolean().describe("Whether the flag is currently enabled."),
  orgId: z.string().uuid().nullish().describe("Organisation scope for the flag, or null for global flags."),
  userId: z.string().uuid().nullish().describe("User scope for the flag, or null when not user-scoped."),
  createdAt: z.date().describe("Timestamp when the flag was created."),
});

export type FeatureFlagDto = z.infer<typeof FeatureFlagSchema>;
