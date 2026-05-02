import { z } from "zod";

import { DOC_TYPES, type DocType } from "../db/entities/docs/enums.ts";

export const AdrFrontmatterSchema = z
  .object({
    status: z.string().min(1),
    decision: z.string().min(1),
    context: z.string().min(1),
    consequences: z.string().min(1),
  })
  .passthrough();

export const PostmortemFrontmatterSchema = z
  .object({
    impact: z.string().min(1),
    timeline: z.string().min(1),
    root_cause: z.string().min(1),
    action_items: z.array(z.string()),
  })
  .passthrough();

export const RfcFrontmatterSchema = z
  .object({
    status: z.enum(["draft", "review", "accepted", "rejected"]),
    summary: z.string().min(1),
  })
  .passthrough();

export const RunbookFrontmatterSchema = z
  .object({
    service: z.string().min(1),
    severity_level: z.enum(["p0", "p1", "p2", "p3"]),
  })
  .passthrough();

export const MeetingFrontmatterSchema = z
  .object({
    date: z.iso.datetime({ offset: true }),
    attendees: z.array(z.string()),
  })
  .passthrough();

export const SpecFrontmatterSchema = z
  .object({
    status: z.enum(["draft", "review", "approved", "deprecated"]),
  })
  .passthrough();

export const WikiFrontmatterSchema = z.object({}).passthrough();
export const NoteFrontmatterSchema = z.object({}).passthrough();
export const ScratchFrontmatterSchema = z.object({}).passthrough();

export const FrontmatterSchemaMap = {
  spec: SpecFrontmatterSchema,
  adr: AdrFrontmatterSchema,
  wiki: WikiFrontmatterSchema,
  runbook: RunbookFrontmatterSchema,
  meeting: MeetingFrontmatterSchema,
  postmortem: PostmortemFrontmatterSchema,
  rfc: RfcFrontmatterSchema,
  note: NoteFrontmatterSchema,
  scratch: ScratchFrontmatterSchema,
} as const satisfies Record<DocType, z.ZodType<unknown>>;

const FrontmatterUnionSchemaMap = {
  spec: SpecFrontmatterSchema.extend({ doc_type: z.literal("spec") }),
  adr: AdrFrontmatterSchema.extend({ doc_type: z.literal("adr") }),
  wiki: WikiFrontmatterSchema.extend({ doc_type: z.literal("wiki") }),
  runbook: RunbookFrontmatterSchema.extend({ doc_type: z.literal("runbook") }),
  meeting: MeetingFrontmatterSchema.extend({ doc_type: z.literal("meeting") }),
  postmortem: PostmortemFrontmatterSchema.extend({ doc_type: z.literal("postmortem") }),
  rfc: RfcFrontmatterSchema.extend({ doc_type: z.literal("rfc") }),
  note: NoteFrontmatterSchema.extend({ doc_type: z.literal("note") }),
  scratch: ScratchFrontmatterSchema.extend({ doc_type: z.literal("scratch") }),
} as const satisfies Record<DocType, z.ZodType<unknown>>;

export const FrontmatterSchema = z.discriminatedUnion("doc_type", [
  FrontmatterUnionSchemaMap.spec,
  FrontmatterUnionSchemaMap.adr,
  FrontmatterUnionSchemaMap.wiki,
  FrontmatterUnionSchemaMap.runbook,
  FrontmatterUnionSchemaMap.meeting,
  FrontmatterUnionSchemaMap.postmortem,
  FrontmatterUnionSchemaMap.rfc,
  FrontmatterUnionSchemaMap.note,
  FrontmatterUnionSchemaMap.scratch,
]);

const schemaMapKeys = Object.keys(FrontmatterSchemaMap).sort();
const docTypeKeys = [...DOC_TYPES].sort();
if (schemaMapKeys.join("\0") !== docTypeKeys.join("\0")) {
  throw new Error("FrontmatterSchemaMap must cover every DocType");
}

export type AdrFrontmatter = z.infer<typeof AdrFrontmatterSchema>;
export type PostmortemFrontmatter = z.infer<typeof PostmortemFrontmatterSchema>;
export type RfcFrontmatter = z.infer<typeof RfcFrontmatterSchema>;
export type RunbookFrontmatter = z.infer<typeof RunbookFrontmatterSchema>;
export type MeetingFrontmatter = z.infer<typeof MeetingFrontmatterSchema>;
export type SpecFrontmatter = z.infer<typeof SpecFrontmatterSchema>;
export type WikiFrontmatter = z.infer<typeof WikiFrontmatterSchema>;
export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;
export type ScratchFrontmatter = z.infer<typeof ScratchFrontmatterSchema>;
export type Frontmatter = z.infer<typeof FrontmatterSchema>;
