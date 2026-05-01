/**
 * Zod schemas for the feature-flags domain.
 * Pillar 7 (feature-flag registry) fills these out fully.
 *
 * D5: Flag names are lowercase-with-hyphens; enforced by the regex validator.
 */

import { z } from "zod";

/** D5: Flag name format — lowercase-with-hyphens. */
export const FlagNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** FeatureFlag row output schema. */
export const FeatureFlagSchema = z.object({
  id: z.string().uuid(),
  flag: FlagNameSchema,
  enabled: z.boolean(),
  orgId: z.string().uuid().nullish(),
  userId: z.string().uuid().nullish(),
  createdAt: z.date(),
});

export type FeatureFlagDto = z.infer<typeof FeatureFlagSchema>;
