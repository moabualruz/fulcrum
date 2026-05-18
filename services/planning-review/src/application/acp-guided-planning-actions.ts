import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";

import { createInMemoryTrafficRecorder, type TrafficEntry } from "@agent-client-protocol/application/traffic.ts";
import type { ModelInfo, PermissionOption, SessionMode } from "@agent-client-protocol/domain/protocol.ts";
import type { AppContext } from "@knowledge-workspace/application/docs/types.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import {
  buildFreeformPlanningPromptFromDocs,
  type FreeformPlanningPromptFromDocsResult,
} from "@planning-review/application/freeform-doc-actions.ts";

export type GuidedAcpPermissionMode = "review_each_tool" | "allow_workspace" | "read_only";

export interface StartGuidedAcpPlanningSessionInput {
  acpSessionId?: string;
  agentName: string;
  cwd: string;
  userPrompt: string;
  promptTemplateId?: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: GuidedAcpPermissionMode;
  maxDocChars?: number;
}

export interface GuidedAcpPlanningSession {
  acpSessionId: string;
  agentName: string;
  cwd: string;
  promptTemplateId: string;
  projectId?: string | null;
  traceId?: string;
  modeId: string;
  modelId?: string;
  permissionMode: GuidedAcpPermissionMode;
  availableModes: SessionMode[];
  availableModels: ModelInfo[];
}

export interface StartGuidedAcpPlanningSessionResult extends FreeformPlanningPromptFromDocsResult {
  status: "ready_for_acp_prompt";
  session: GuidedAcpPlanningSession;
  permissionOptions: PermissionOption[];
  traffic: { entries: TrafficEntry[] };
  eventId: string;
}

const DEFAULT_MODES: SessionMode[] = [
  { id: "planning", name: "Planning", description: "Prototype-first technical planning" },
  { id: "review", name: "Review", description: "Review and annotate generated material" },
];

const DEFAULT_PERMISSION_OPTIONS: PermissionOption[] = [
  { optionId: "allow_once", kind: "allow", name: "Allow once" },
  { optionId: "allow_session", kind: "allow", name: "Allow for session" },
  { optionId: "deny", kind: "reject", name: "Deny" },
];

export async function startGuidedAcpPlanningSession(
  em: EntityManager,
  ctx: AppContext,
  input: StartGuidedAcpPlanningSessionInput,
): Promise<StartGuidedAcpPlanningSessionResult> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  const acpSessionId = input.acpSessionId ?? `acp-${randomUUID()}`;
  const modeId = input.modeId ?? "planning";
  const promptTemplateId = input.promptTemplateId ?? "prototype-first";
  const permissionMode = input.permissionMode ?? "review_each_tool";
  const planning = await buildFreeformPlanningPromptFromDocs(em, { ...ctx, projectId }, {
    userPrompt: input.userPrompt,
    selectedDocIds: input.selectedDocIds,
    traceId: input.traceId,
    maxDocChars: input.maxDocChars,
  });
  const session: GuidedAcpPlanningSession = {
    acpSessionId,
    agentName: input.agentName,
    cwd: input.cwd,
    promptTemplateId,
    projectId,
    traceId: input.traceId,
    modeId,
    modelId: input.modelId,
    permissionMode,
    availableModes: DEFAULT_MODES,
    availableModels: input.modelId ? [{ modelId: input.modelId, name: input.modelId }] : [],
  };
  const prompt = appendGuidedAcpInstructions(planning.prompt, session);
  const traffic = createInMemoryTrafficRecorder();
  traffic.addEntry({
    direction: "out",
    type: "request",
    method: "session/new",
    requestId: 1,
    payload: {
      acpSessionId,
      agentName: input.agentName,
      cwd: input.cwd,
      modeId,
      modelId: input.modelId,
      permissionMode,
    },
  });
  traffic.addEntry({
    direction: "out",
    type: "request",
    method: "session/prompt",
    requestId: 2,
    payload: {
      acpSessionId,
      traceId: input.traceId,
      promptTemplateId,
      sourceRefs: planning.context.sourceRefs,
      prompt,
    },
  });

  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId,
    actor: "system",
    subjectKind: "acp_session",
    subjectId: acpSessionId,
    verb: "acp_guided_planning_started",
    payload: {
      traceId: input.traceId,
      acpSessionId,
      agentName: input.agentName,
      cwd: input.cwd,
      modeId,
      modelId: input.modelId,
      promptTemplateId,
      permissionMode,
      sourceRefs: planning.context.sourceRefs,
      selectedDocIds: input.selectedDocIds ?? [],
      trafficMethods: traffic.entries.map((entry) => entry.method),
    },
  });

  return {
    status: "ready_for_acp_prompt",
    session,
    permissionOptions: DEFAULT_PERMISSION_OPTIONS,
    traffic: { entries: traffic.entries },
    eventId: event.id,
    context: planning.context,
    prompt,
  };
}

function appendGuidedAcpInstructions(prompt: string, session: GuidedAcpPlanningSession): string {
  const lines = [
    prompt,
    "",
    "## AI Assist guided session",
    `- Agent: ${session.agentName}`,
    `- CWD: ${session.cwd}`,
    `- Mode: ${session.modeId}`,
    session.modelId ? `- Model: ${session.modelId}` : null,
    `- Prompt template: ${session.promptTemplateId}`,
    `- Permission mode: ${session.permissionMode}`,
    "",
    "Use the selected docs as context, request permissions before tool use, keep traffic visible, and submit the technical plan through submit_plan.",
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}
