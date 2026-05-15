import { z } from "zod";

import { SkillConflictKind, SkillConflictStatus } from "@platform-core/infrastructure/application-database/entities/skills/SkillConflict.ts";

export const SkillOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  source: z.string(),
  upstreamRepo: z.string().nullable(),
  upstreamRef: z.string().nullable(),
  enabledAgents: z.array(z.string()),
});

export const SkillRegistryEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  source: z.enum(["local", "upstream", "mcp"]),
  version: z.string().nullable(),
  enabledAgents: z.array(z.string()),
});

export const SkillConflictOutputSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: z.nativeEnum(SkillConflictKind),
  status: z.nativeEnum(SkillConflictStatus),
  localHash: z.string().nullable().optional(),
  upstreamHash: z.string().nullable().optional(),
  baseHash: z.string().nullable().optional(),
  expectedSha256: z.string().nullable().optional(),
  actualSha256: z.string().nullable().optional(),
  suggestedResolution: z.string().nullable().optional(),
  auditNote: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SkillDto = z.infer<typeof SkillOutputSchema>;
export type SkillRegistryEntryDto = z.infer<typeof SkillRegistryEntrySchema>;
export type SkillConflictDto = z.infer<typeof SkillConflictOutputSchema>;

export interface AppContext {
  orgId: string;
}
