import { z } from "zod";

export const DOC_TYPES = [
  "spec",
  "adr",
  "wiki",
  "runbook",
  "meeting",
  "postmortem",
  "rfc",
  "note",
  "scratch",
] as const;

export const SCOPES = ["project", "global"] as const;

export const LINK_KINDS = [
  "wikilink",
  "task_ref",
  "run_ref",
  "mention",
] as const;

export const DocTypeEnum = z.enum(DOC_TYPES);
export const ScopeEnum = z.enum(SCOPES);
export const LinkKindEnum = z.enum(LINK_KINDS);

export type DocType = (typeof DOC_TYPES)[number];
export type Scope = (typeof SCOPES)[number];
export type LinkKind = (typeof LINK_KINDS)[number];
