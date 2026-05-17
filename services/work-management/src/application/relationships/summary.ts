import { z } from "zod";

import { traceRefSchema, traceSpineSchema, type TraceRef, type TraceSpine } from "@workflow-coordination/domain/trace.ts";

export const relationshipBucketSchema = z.enum([
  "projects",
  "repos",
  "workItems",
  "docs",
  "contextBundles",
  "routingDecisions",
  "runs",
  "liveSessions",
  "artifacts",
  "memory",
  "automations",
  "audit",
]);

export const relationshipIncludeSchema = z.array(relationshipBucketSchema).default([]);

export type RelationshipBucket = z.infer<typeof relationshipBucketSchema>;

const emptyBuckets = (): Record<RelationshipBucket, string[]> => ({
  projects: [],
  repos: [],
  workItems: [],
  docs: [],
  contextBundles: [],
  routingDecisions: [],
  runs: [],
  liveSessions: [],
  artifacts: [],
  memory: [],
  automations: [],
  audit: [],
});

export const relationshipSummarySchema = z.object({
  entity: traceRefSchema,
  trace: traceSpineSchema,
  counts: z.partialRecord(relationshipBucketSchema, z.number().int().nonnegative()),
  ids: z.partialRecord(relationshipBucketSchema, z.array(z.string().min(1))),
  included: relationshipIncludeSchema,
  expanded: z.partialRecord(relationshipBucketSchema, z.array(traceRefSchema)).optional(),
}).superRefine((value, ctx) => {
  if (value.entity.kind !== "workspace" && !value.trace.project) {
    ctx.addIssue({
      code: "custom",
      message: `${value.entity.kind} relationship summary requires project trace`,
      path: ["trace", "project"],
    });
  }
});

export type RelationshipSummary = z.infer<typeof relationshipSummarySchema>;

function bucketForKind(kind: TraceRef["kind"]): RelationshipBucket | null {
  switch (kind) {
    case "project":
    case "parent_project":
    case "subproject":
      return "projects";
    case "repo":
      return "repos";
    case "work_item":
      return "workItems";
    case "doc":
      return "docs";
    case "context_bundle":
      return "contextBundles";
    case "routing_decision":
      return "routingDecisions";
    case "run":
      return "runs";
    case "live_session":
      return "liveSessions";
    case "artifact":
      return "artifacts";
    case "memory":
      return "memory";
    case "automation":
      return "automations";
    case "audit":
      return "audit";
    case "workspace":
      return null;
  }
}

export function summarizeRelationships(input: {
  entity: TraceRef;
  trace: TraceSpine;
  refs: TraceRef[];
  include?: RelationshipBucket[];
}): RelationshipSummary {
  const include = relationshipIncludeSchema.parse(input.include ?? []);
  const ids = emptyBuckets();
  const expanded: Partial<Record<RelationshipBucket, TraceRef[]>> = {};

  for (const ref of input.refs) {
    const bucket = bucketForKind(ref.kind);
    if (!bucket) continue;
    ids[bucket].push(ref.id);
    if (include.includes(bucket)) expanded[bucket] = [...(expanded[bucket] ?? []), ref];
  }

  const counts = Object.fromEntries(
    Object.entries(ids).map(([bucket, values]) => [bucket, values.length]),
  ) as Partial<Record<RelationshipBucket, number>>;

  const summary = {
    entity: input.entity,
    trace: input.trace,
    counts,
    ids,
    included: include,
    expanded: Object.keys(expanded).length > 0 ? expanded : undefined,
  };

  return relationshipSummarySchema.parse(summary);
}
