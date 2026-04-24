import { z } from "zod";
import {
  MCP_TOOL_NAMES,
  PolicyActionSchema,
  TaskStatusSchema,
  makeId,
  type PolicyDecision
} from "@fulcrum/shared";
import type {
  ArtifactService,
  CodeEvidenceService,
  ContextPackBuilder,
  MemoryService,
  PolicyEnforcementService,
  ProjectRegistryService,
  QualityGateRunner,
  RunLifecycleService,
  LocalTaskService,
  WorktreeAllocationService,
  WorktreeStatusService
} from "@fulcrum/core";
import { fromPolicyDecision, fromUnknownError, ok, type McpCommonResponse } from "./errors.js";

export interface McpToolRuntime {
  doctor: (input?: {
    projectId?: string;
    deep?: boolean;
    noNetwork?: boolean;
  }) => unknown | Promise<unknown>;
  projects: ProjectRegistryService;
  tasks: LocalTaskService;
  runs: RunLifecycleService;
  context: ContextPackBuilder;
  memory: MemoryService;
  code: CodeEvidenceService;
  artifacts: ArtifactService;
  quality: QualityGateRunner;
  policy: PolicyEnforcementService;
  worktrees: WorktreeAllocationService;
  worktreeStatus: WorktreeStatusService;
}

export interface McpToolDefinition {
  name: (typeof MCP_TOOL_NAMES)[number];
  aliases: string[];
  description: string;
  inputSchema: z.ZodTypeAny;
  permission: "read" | "write" | "policy_gated";
  execute: (args: unknown) => Promise<McpCommonResponse>;
}

const Empty = z.object({}).passthrough().default({});
const OptionalId = z.string().optional();

export function createMcpToolDefinitions(runtime: McpToolRuntime): McpToolDefinition[] {
  const tool = <T extends z.ZodTypeAny>(
    name: McpToolDefinition["name"],
    description: string,
    inputSchema: T,
    permission: McpToolDefinition["permission"],
    execute: (args: z.infer<T>) => unknown | Promise<unknown>,
    options: { policyDecisionIsResult?: boolean } = {}
  ): McpToolDefinition => ({
    name,
    aliases: aliases[name] ?? [],
    description,
    inputSchema,
    permission,
    execute: async (raw) => {
      try {
        const parsed = inputSchema.parse(raw ?? {});
        const data = await execute(parsed);
        const policyDecisionIds = extractPolicyDecisionIds(data);
        const policyDecision = extractPolicyDecision(data);
        if (
          policyDecision &&
          !options.policyDecisionIsResult &&
          ["denied", "approval_required"].includes(policyDecision.status)
        ) {
          return fromPolicyDecision(policyDecision);
        }
        return ok(data, { policyDecisionIds });
      } catch (error) {
        return fromUnknownError(error);
      }
    }
  });

  return [
    tool(
      "fulcrum_doctor_status",
      "Report local Fulcrum capability and privacy health.",
      z.object({
        projectId: OptionalId,
        deep: z.boolean().optional(),
        noNetwork: z.boolean().optional()
      }),
      "read",
      (input) => runtime.doctor(input)
    ),
    tool(
      "fulcrum_project_list",
      "List registered projects and health counts.",
      z.object({
        healthState: z.string().optional(),
        privacyMode: z.string().optional(),
        limit: z.number().int().positive().optional()
      }),
      "read",
      (input) =>
        runtime.projects
          .overview()
          .filter((entry) => !input.healthState || entry.project.healthState === input.healthState)
          .filter((entry) => !input.privacyMode || entry.project.privacyMode === input.privacyMode)
          .slice(0, input.limit ?? 100)
    ),
    tool(
      "fulcrum_task_get",
      "Fetch task detail with current run and policy context.",
      z.object({ taskId: z.string() }),
      "read",
      ({ taskId }) => {
        const task = runtime.tasks.get(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        return {
          task,
          project: runtime.projects.get(task.projectId),
          currentRun: task.currentRunId ? runtime.runs.get(task.currentRunId) : undefined
        };
      }
    ),
    tool(
      "fulcrum_task_claim",
      "Claim a ready task for an agent.",
      z.object({ taskId: z.string(), requester: z.string(), agentId: OptionalId }),
      "write",
      ({ taskId, requester, agentId }) => {
        const task = runtime.tasks.get(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        const claimed = task.status === "pending" ? runtime.tasks.transition(taskId, "ready") : task;
        if (claimed.status !== "ready") {
          throw new Error(`Task cannot be claimed from status: ${claimed.status}`);
        }
        return { task: claimed, claimedBy: agentId ?? requester };
      }
    ),
    tool(
      "fulcrum_task_update_status",
      "Update task lifecycle status.",
      z.object({
        taskId: z.string(),
        status: TaskStatusSchema,
        requester: z.string(),
        reason: OptionalId,
        policyDecisionId: OptionalId
      }),
      "write",
      ({ taskId, status }) => runtime.tasks.transition(taskId, status)
    ),
    tool(
      "fulcrum_task_list",
      "List task summaries.",
      z.object({
        projectId: OptionalId,
        status: OptionalId,
        agentId: OptionalId,
        queue: OptionalId,
        limit: z.number().int().positive().optional()
      }),
      "read",
      (input) =>
        runtime.tasks
          .list(input.projectId)
          .filter((task) => !input.status || task.status === input.status)
          .slice(0, input.limit ?? 100)
    ),
    tool(
      "fulcrum_run_start",
      "Start or preview supervised agent run.",
      z.object({
        taskId: z.string(),
        agentId: z.string(),
        contextPackId: OptionalId,
        worktreePolicyOverride: OptionalId,
        previewOnly: z.boolean().optional()
      }),
      "policy_gated",
      (input) =>
        input.previewOnly
          ? { preview: true, taskId: input.taskId, agentId: input.agentId }
          : runtime.runs.start({
              taskId: input.taskId,
              agentId: input.agentId,
              contextPackId: input.contextPackId,
              allocateWorktree: false
            })
    ),
    tool(
      "fulcrum_run_heartbeat",
      "Record run heartbeat.",
      z.object({
        runId: z.string(),
        source: z.string(),
        message: z.string(),
        progress: z.number().optional(),
        artifactRefs: z.array(z.string()).optional()
      }),
      "write",
      (input) => runtime.runs.heartbeat(input.runId, input)
    ),
    tool(
      "fulcrum_run_event",
      "Append redacted run event.",
      z.object({
        runId: z.string(),
        type: z.string(),
        severity: z.string(),
        payloadSummary: z.string(),
        payloadRef: OptionalId,
        artifactRefs: z.array(z.string()).optional()
      }),
      "write",
      (input) => {
        const run = runtime.runs.get(input.runId);
        if (!run) throw new Error(`Run not found: ${input.runId}`);
        return runtime.runs.appendEvent({
          eventId: makeId("evt", `${input.runId}-${input.type}-${Date.now()}`),
          timestamp: new Date().toISOString(),
          source: "mcp",
          severity: input.severity as never,
          type: input.type as never,
          projectId: run.projectId,
          taskId: run.taskId,
          runId: run.runId,
          payloadSummary: { message: input.payloadSummary },
          payloadRef: input.payloadRef ?? null,
          artifactRefs: input.artifactRefs ?? [],
          policyDecisionRefs: [],
          redactionStatus: "needs_review",
          degraded: [],
          schemaVersion: "1.0"
        });
      }
    ),
    tool(
      "fulcrum_run_complete",
      "Complete supervised run.",
      z.object({
        runId: z.string(),
        summary: z.string(),
        outcome: z.enum(["succeeded", "failed"]),
        artifactIds: z.array(z.string()).optional(),
        qualityGateResultIds: z.array(z.string()).optional()
      }),
      "policy_gated",
      (input) =>
        runtime.runs.complete(input.runId, {
          summary: input.summary,
          outcome: input.outcome,
          artifactIds: input.artifactIds,
          qualityGateIds: input.qualityGateResultIds
        })
    ),
    tool(
      "fulcrum_context_build",
      "Build context pack.",
      z.object({
        taskId: z.string(),
        runId: OptionalId,
        budget: z.number().optional(),
        lanes: z.array(z.string()).optional(),
        offlineOnly: z.boolean().optional(),
        format: OptionalId
      }),
      "write",
      (input) =>
        runtime.context.build({
          taskId: input.taskId,
          runId: input.runId,
          budget: input.budget,
          lanes: input.lanes,
          offline: input.offlineOnly
        })
    ),
    tool(
      "fulcrum_context_get",
      "Fetch context pack.",
      z.object({ contextPackId: z.string() }),
      "read",
      ({ contextPackId }) =>
        requireValue(runtime.context.get(contextPackId), `Context pack not found: ${contextPackId}`)
    ),
    tool(
      "fulcrum_context_explain",
      "Explain context inclusion and omissions.",
      z.object({ contextPackId: z.string() }),
      "read",
      ({ contextPackId }) =>
        requireValue(runtime.context.get(contextPackId), `Context pack not found: ${contextPackId}`)
    ),
    tool(
      "fulcrum_memory_search",
      "Search project memory.",
      z.object({
        projectId: z.string(),
        query: z.string(),
        limit: z.number().optional(),
        status: OptionalId
      }),
      "read",
      (input) => runtime.memory.search(input)
    ),
    tool(
      "fulcrum_memory_add",
      "Draft project memory with permanent-memory policy result.",
      z.object({
        projectId: z.string(),
        title: z.string(),
        body: z.string().optional(),
        fileRef: OptionalId,
        sourceRefs: z
          .array(z.object({ type: z.string(), uri: z.string(), label: z.string().optional() }))
          .optional(),
        linkedTaskId: OptionalId,
        linkedRunId: OptionalId,
        permanent: z.boolean().optional()
      }),
      "policy_gated",
      (input) => {
        const result = runtime.memory.draft({
          projectId: input.projectId,
          title: input.title,
          body: input.body ?? input.fileRef ?? "",
          sourceRefs: (input.sourceRefs as never) ?? [],
          linkedTaskIds: input.linkedTaskId ? [input.linkedTaskId] : [],
          linkedRunIds: input.linkedRunId ? [input.linkedRunId] : [],
          requester: "mcp"
        });
        return input.permanent ? result : { entry: result.entry };
      }
    ),
    tool(
      "fulcrum_code_search",
      "Search code evidence.",
      z.object({
        projectId: z.string(),
        query: z.string(),
        modes: z.array(z.string()).default(["exact"]),
        paths: z.array(z.string()).optional(),
        limit: z.number().optional(),
        includeSemantic: z.boolean().optional()
      }),
      "read",
      (input) => runtime.code.search(input)
    ),
    tool(
      "fulcrum_repo_map_get",
      "Return local repo-map placeholder evidence.",
      z.object({
        projectId: z.string(),
        refresh: z.boolean().optional(),
        paths: z.array(z.string()).optional()
      }),
      "read",
      (input) => ({
        projectId: input.projectId,
        freshness: new Date().toISOString(),
        limitations: ["Repo map adapter not configured."],
        refs: []
      })
    ),
    tool(
      "fulcrum_repomix_pack",
      "Return repo-pack preview placeholder.",
      z.object({
        projectId: z.string(),
        paths: z.array(z.string()).optional(),
        previewOnly: z.boolean().optional(),
        budget: z.number().optional()
      }),
      "policy_gated",
      (input) => ({
        projectId: input.projectId,
        previewOnly: input.previewOnly ?? true,
        redactionStatus: "needs_review",
        includedFiles: []
      })
    ),
    tool(
      "fulcrum_worktree_allocate",
      "Allocate task worktree.",
      z.object({
        taskId: z.string(),
        runId: OptionalId,
        policyDecisionId: OptionalId,
        previewOnly: z.boolean().optional()
      }),
      "policy_gated",
      (input) =>
        input.previewOnly
          ? { preview: true, taskId: input.taskId }
          : runtime.worktrees.allocate({ taskId: input.taskId, runId: input.runId })
    ),
    tool(
      "fulcrum_worktree_status",
      "Inspect worktree status.",
      z.object({ worktreeId: z.string() }),
      "read",
      ({ worktreeId }) => runtime.worktreeStatus.inspect(worktreeId)
    ),
    tool(
      "fulcrum_artifact_attach",
      "Attach local artifact to run.",
      z.object({
        runId: z.string(),
        type: z.string(),
        localRef: OptionalId,
        contentRef: OptionalId,
        summary: z.string(),
        linkedRefs: z.array(z.unknown()).optional()
      }),
      "write",
      async (input) => {
        const run = runtime.runs.get(input.runId);
        if (!run) throw new Error(`Run not found: ${input.runId}`);
        return runtime.artifacts.attach({
          runId: input.runId,
          projectId: run.projectId,
          taskId: run.taskId,
          type: input.type as never,
          localRef: input.localRef ?? input.contentRef ?? "",
          summary: input.summary,
          capturedBy: "mcp"
        });
      }
    ),
    tool(
      "fulcrum_quality_gate_run",
      "Run quality gate.",
      z.object({
        projectId: z.string(),
        gateName: z.string(),
        taskId: OptionalId,
        runId: OptionalId,
        policyDecisionId: OptionalId,
        previewOnly: z.boolean().optional(),
        cwd: OptionalId
      }),
      "policy_gated",
      async (input) => {
        const policyDecision = qualityGatePolicyDecision(runtime, {
          policyDecisionId: input.policyDecisionId,
          projectId: input.projectId,
          taskId: input.taskId,
          runId: input.runId,
          gateName: input.gateName
        });
        if (policyDecision) return policyDecision;
        return input.previewOnly
          ? { preview: true, projectId: input.projectId, gateName: input.gateName }
          : runtime.quality.run({
              gateId: input.gateName,
              projectId: input.projectId,
              taskId: input.taskId,
              runId: input.runId,
              cwd: input.cwd ?? process.cwd()
            });
      }
    ),
    tool(
      "fulcrum_policy_check",
      "Evaluate policy under same MCP rules.",
      z.object({
        action: PolicyActionSchema,
        subjectType: z.string(),
        subjectId: z.string(),
        requester: z.string(),
        projectId: OptionalId,
        runId: OptionalId,
        taskId: OptionalId,
        preview: z.boolean().optional()
      }),
      "policy_gated",
      (input) =>
        runtime.policy.check({
          ...input,
          preview: input.preview ?? true,
          localOnly: true
        }),
      { policyDecisionIsResult: true }
    )
  ];
}

export function listMcpToolVisibility(definitions: McpToolDefinition[]) {
  return definitions.map((definition) => ({
    name: definition.name,
    aliases: definition.aliases,
    permission: definition.permission,
    description: definition.description,
    visibleInCockpit: true
  }));
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function extractPolicyDecisionIds(data: unknown): string[] {
  const decision = extractPolicyDecision(data);
  return decision ? [decision.policyDecisionId] : [];
}

function extractPolicyDecision(data: unknown): PolicyDecision | undefined {
  if (!data || typeof data !== "object") return undefined;
  const candidate = data as {
    policyDecision?: PolicyDecision;
    decision?: PolicyDecision;
    policyDecisionId?: string;
    status?: string;
  };
  if (candidate.policyDecision) return candidate.policyDecision;
  if (candidate.decision?.policyDecisionId) return candidate.decision;
  if (candidate.policyDecisionId && candidate.status) return candidate as PolicyDecision;
  return undefined;
}

function qualityGatePolicyDecision(
  runtime: McpToolRuntime,
  input: {
    policyDecisionId?: string;
    projectId: string;
    taskId?: string;
    runId?: string;
    gateName: string;
  }
): PolicyDecision | undefined {
  if (!input.policyDecisionId) {
    return runtime.policy.check({
      action: "arbitrary_shell",
      subjectType: "quality_gate",
      subjectId: input.gateName,
      requester: "mcp",
      projectId: input.projectId,
      taskId: input.taskId,
      runId: input.runId,
      preview: true,
      localOnly: true
    }).decision;
  }

  const decision = runtime.policy.get(input.policyDecisionId);
  if (!decision) {
    throw new Error(`Policy decision not found: ${input.policyDecisionId}`);
  }
  if (
    decision.status !== "approved" ||
    decision.action !== "arbitrary_shell" ||
    decision.subjectType !== "quality_gate" ||
    decision.subjectId !== input.gateName
  ) {
    throw new Error(`Policy decision is not approved for quality gate: ${input.gateName}`);
  }
  return undefined;
}

const aliases: Partial<Record<McpToolDefinition["name"], string[]>> = {
  fulcrum_doctor_status: ["fulcrum.doctor.status"],
  fulcrum_project_list: ["fulcrum.project.list"]
};
