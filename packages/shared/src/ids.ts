import { z } from "zod";

export const SCHEMA_VERSION = "1.0";

export const idPrefixes = [
  "setup",
  "proj",
  "task",
  "run",
  "evt",
  "ctx",
  "ctxi",
  "gl",
  "mem",
  "evid",
  "wt",
  "art",
  "pol",
  "cap",
  "gate",
  "adapter",
  "mirror",
  "draft",
  "preview",
  "backup",
  "export",
  "release",
  "restore",
  "rebuild",
  "reset",
  "uninstall"
] as const;

export const IdPrefixSchema = z.enum(idPrefixes);
export type IdPrefix = z.infer<typeof IdPrefixSchema>;

export const FulcrumIdSchema = z.string().regex(/^[a-z]+_[a-z0-9][a-z0-9_-]*$/);
export type FulcrumId = z.infer<typeof FulcrumIdSchema>;

export function makeId(prefix: IdPrefix, seed: string): FulcrumId {
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return FulcrumIdSchema.parse(`${prefix}_${normalized || "local"}`);
}

export const TimestampSchema = z.string().datetime();
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);
