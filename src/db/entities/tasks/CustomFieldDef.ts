import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";

import { Org } from "../auth/Org.ts";

export const CUSTOM_FIELD_TYPES = [
  "text",
  "select",
  "multi_select",
  "number",
  "date",
  "user",
  "url",
  "json",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const OptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  color: z.string().trim().min(1),
}).strict();

export const CustomFieldConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text") }).strict(),
  z.object({
    type: z.literal("select"),
    options: z.array(OptionSchema).min(1),
  }).strict(),
  z.object({
    type: z.literal("multi_select"),
    options: z.array(OptionSchema).min(1),
  }).strict(),
  z.object({
    type: z.literal("number"),
    unit: z.string().trim().min(1).optional(),
    decimals: z.number().int().min(0).max(10).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).strict().refine(
    (input) => input.min === undefined || input.max === undefined || input.min <= input.max,
    { message: "min must be less than or equal to max", path: ["max"] },
  ),
  z.object({ type: z.literal("date"), include_time: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("user"), multi: z.boolean().optional() }).strict(),
  z.object({
    type: z.literal("url"),
    display_as: z.enum(["link", "embed"]).optional(),
  }).strict(),
  z.object({ type: z.literal("json") }).strict(),
]);
export type CustomFieldConfig = z.infer<typeof CustomFieldConfigSchema>;

@Entity({ tableName: "custom_field_defs" })
@Index({
  name: "custom_field_defs_org_project",
  properties: ["org", "projectId"],
})
@Unique({
  name: "custom_field_defs_project_slug_unique",
  properties: ["projectId", "slug"],
})
export class CustomFieldDef {
  [OptionalProps]?:
    | "configJson"
    | "required"
    | "archived"
    | "position";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string" })
  slug!: string;

  @Property({
    type: "string",
    check:
      "type in ('text','select','multi_select','number','date','user','url','json')",
  })
  type!: CustomFieldType;

  @Property({
    type: "json",
    fieldName: "config_json",
    defaultRaw: "'{}'::jsonb",
    returning: false,
  })
  configJson: Record<string, unknown> = {};

  @Property({ type: "boolean", default: false })
  required: boolean = false;

  @Property({ type: "boolean", default: false })
  archived: boolean = false;

  @Property({ type: "integer", default: 0 })
  position: number = 0;
}

const DEFAULT_CUSTOM_FIELDS: Array<{
  slug: string;
  name: string;
  type: CustomFieldType;
  configJson: Record<string, unknown>;
}> = [
  {
    slug: "status",
    name: "Status",
    type: "select",
    configJson: {
      options: [
        { value: "backlog", label: "Backlog", color: "#6B7280" },
        { value: "todo", label: "Todo", color: "#3B82F6" },
        { value: "in_progress", label: "In Progress", color: "#F59E0B" },
        { value: "in_review", label: "In Review", color: "#8B5CF6" },
        { value: "blocked", label: "Blocked", color: "#EF4444" },
        { value: "done", label: "Done", color: "#10B981" },
        { value: "cancelled", label: "Cancelled", color: "#6B7280" },
      ],
    },
  },
  {
    slug: "priority",
    name: "Priority",
    type: "select",
    configJson: {
      options: [
        { value: "urgent", label: "Urgent", color: "#DC2626" },
        { value: "high", label: "High", color: "#EA580C" },
        { value: "medium", label: "Medium", color: "#D97706" },
        { value: "low", label: "Low", color: "#16A34A" },
        { value: "none", label: "None", color: "#6B7280" },
      ],
    },
  },
  { slug: "assignee", name: "Assignee", type: "user", configJson: { multi: true } },
  { slug: "due_date", name: "Due date", type: "date", configJson: {} },
  {
    slug: "estimate",
    name: "Estimate",
    type: "number",
    configJson: { unit: "points", decimals: 0, min: 0 },
  },
  { slug: "parent", name: "Parent", type: "text", configJson: {} },
  { slug: "tags", name: "Tags", type: "multi_select", configJson: { options: [
    { value: "frontend", label: "Frontend", color: "#0EA5E9" },
    { value: "backend", label: "Backend", color: "#22C55E" },
    { value: "infra", label: "Infra", color: "#A855F7" },
  ] } },
  { slug: "repo", name: "Repository", type: "url", configJson: { display_as: "link" } },
  { slug: "sprint", name: "Sprint", type: "text", configJson: {} },
];

export async function seedDefaultFields(
  em: EntityManager,
  projectId: string,
  orgId: string,
): Promise<void> {
  const scopedEm = em.fork();
  const repo = scopedEm.getRepository(CustomFieldDef);
  const org = scopedEm.getReference(Org, orgId);

  await Promise.all(
    DEFAULT_CUSTOM_FIELDS.map((field, position) =>
      repo.upsert(
        {
          org,
          projectId,
          ...field,
          position,
        },
        { onConflictFields: ["projectId", "slug"] },
      )
    ),
  );
}
