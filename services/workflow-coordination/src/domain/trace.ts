import { z } from "zod";

export const traceEntityKindSchema = z.enum([
  "workspace",
  "project",
  "parent_project",
  "subproject",
  "repo",
  "work_item",
  "doc",
  "context_bundle",
  "routing_decision",
  "run",
  "live_session",
  "artifact",
  "memory",
  "automation",
  "audit",
]);

export const traceRefSchema = z.object({
  kind: traceEntityKindSchema,
  id: z.string().min(1),
  label: z.string().min(1).optional(),
});

export type TraceRef = z.infer<typeof traceRefSchema>;

export const traceSpineSchema = z.object({
  workspace: traceRefSchema.optional(),
  project: traceRefSchema.optional(),
  parentProject: traceRefSchema.optional(),
  subproject: traceRefSchema.optional(),
  repo: traceRefSchema.optional(),
  workItem: traceRefSchema.optional(),
  doc: traceRefSchema.optional(),
  contextBundle: traceRefSchema.optional(),
  routingDecision: traceRefSchema.optional(),
  run: traceRefSchema.optional(),
  liveSession: traceRefSchema.optional(),
  artifact: traceRefSchema.optional(),
  memory: traceRefSchema.optional(),
  automation: traceRefSchema.optional(),
  audit: traceRefSchema.optional(),
}).superRefine((value, ctx) => {
  const linkedEntity =
    value.workItem ?? value.doc ?? value.contextBundle ?? value.routingDecision ??
    value.run ?? value.liveSession ?? value.artifact ?? value.memory ?? value.automation;
  if (linkedEntity && !value.project) {
    ctx.addIssue({
      code: "custom",
      message: `${linkedEntity.kind} trace requires project linkage`,
      path: ["project"],
    });
  }
  if (value.run && (!value.workItem || !value.contextBundle)) {
    ctx.addIssue({
      code: "custom",
      message: "run trace requires workItem and contextBundle linkage",
      path: ["run"],
    });
  }
  if (value.artifact && !value.run && !value.doc) {
    ctx.addIssue({
      code: "custom",
      message: "artifact trace requires run or doc linkage",
      path: ["artifact"],
    });
  }
  if (value.memory && !value.workItem && !value.run && !value.doc && !value.artifact) {
    ctx.addIssue({
      code: "custom",
      message: "memory trace requires source workItem, run, doc, or artifact linkage",
      path: ["memory"],
    });
  }
});

export type TraceSpine = z.infer<typeof traceSpineSchema>;
