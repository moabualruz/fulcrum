import type { BuildApprovedPlanBreakdownInput } from "@planning-review/application/approved-plan-breakdown.ts";
import type {
  ApprovedPlanMaterializeInput,
  PlanningFreeformPromptInput,
  PlanningFreeformStartInput,
  PlanningGuidedAcpStartInput,
  PlanningGuidedAcpSessionActionInput,
  PlanningContinuousUpdateInput,
  PlanningTechnicalCycleInput,
  PlanningArtifactExecutionInput,
  PlanningArtifactRunInput,
} from "@workflow-coordination/application/planning-preview.service.ts";

export class PlanningApprovedPlanRequestDto implements BuildApprovedPlanBreakdownInput {
  planId!: string;
  approvedPlanMarkdown!: string;
  traceId?: string;
  reviewId?: string;
  projectId?: string | null;
  cycleId?: string | null;
  moduleId?: string | null;
  sourceDocRefs?: BuildApprovedPlanBreakdownInput["sourceDocRefs"];
}

export class PlanningMaterializeRequestDto implements ApprovedPlanMaterializeInput {
  planId!: string;
  approvedPlanMarkdown!: string;
  traceId?: string;
  reviewId?: string;
  projectId!: string;
  cycleId?: string | null;
  moduleId?: string | null;
  sourceDocRefs?: BuildApprovedPlanBreakdownInput["sourceDocRefs"];
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectSlug!: string;
  projectName!: string;
}

export class PlanningFreeformPromptRequestDto implements PlanningFreeformPromptInput {
  projectId!: string;
  userPrompt!: string;
  selectedDocIds?: string[];
  traceId?: string;
  maxDocChars?: number;
}

export class PlanningFreeformStartRequestDto implements PlanningFreeformStartInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  documentId?: string;
  parentId?: string | null;
  title!: string;
  bodyMd!: string;
  userPrompt!: string;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

export class PlanningGuidedAcpStartRequestDto implements PlanningGuidedAcpStartInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  acpSessionId!: string;
  agentName!: string;
  cwd!: string;
  userPrompt!: string;
  promptTemplateId?: string;
  selectedDocIds?: string[];
  traceId?: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: PlanningGuidedAcpStartInput["permissionMode"];
  maxDocChars?: number;
}

export class PlanningGuidedAcpSessionActionRequestDto implements PlanningGuidedAcpSessionActionInput {
  acpSessionId!: string;
  action!: PlanningGuidedAcpSessionActionInput["action"];
  projectId?: string | null;
  traceId?: string;
  optionId?: string;
  modeId?: string;
  modelId?: string;
}

export class PlanningContinuousChangedDocDto {
  id?: string;
  title?: string;
  bodyMd?: string;
}

export class PlanningContinuousUpdateRequestDto implements PlanningContinuousUpdateInput {
  workspaceId!: string;
  workspaceSlug!: string;
  workspaceName!: string;
  projectId!: string;
  projectSlug!: string;
  projectName!: string;
  trigger!: PlanningContinuousUpdateInput["trigger"];
  userPrompt!: string;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  selectedDocIds?: string[];
  targetTaskIds?: string[];
  changedDocs?: PlanningContinuousChangedDocDto[];
  maxDocChars?: number;
}

export class PlanningTechnicalTaskSeedDto {
  clientKey!: string;
  title!: string;
  dependsOn?: string[];
  success?: string;
}

export class PlanningTechnicalCycleRequestDto implements PlanningTechnicalCycleInput {
  projectId!: string;
  source!: PlanningTechnicalCycleInput["source"];
  userPrompt!: string;
  selectedDocIds?: string[];
  traceId?: string;
  maxDocChars?: number;
  planId?: string;
  reviewId?: string;
  prototypePaths?: string[];
  boilerplatePaths?: string[];
  successCriteria?: string[];
  taskSeeds?: PlanningTechnicalTaskSeedDto[];
}

export class PlanningArtifactExecutionRequestDto implements PlanningArtifactExecutionInput {
  planId!: string;
  artifactPath!: string;
  status!: PlanningArtifactExecutionInput["status"];
  prototypeId?: string;
  artifactId?: string;
  traceId?: string;
  command?: string;
  args?: string[];
  urlPath?: string;
  summary?: string;
  outputRef?: string;
  checks?: string[];
  executedAt?: string;
}

export class PlanningArtifactRunRequestDto implements PlanningArtifactRunInput {
  planId!: string;
  artifactPath!: string;
  prototypeId?: string;
  artifactId?: string;
  traceId?: string;
  command?: string;
  args?: string[];
  urlPath?: string;
  summary?: string;
  outputRef?: string;
  checks?: string[];
  executedAt?: string;
  cwd?: string;
  branch?: string;
  copyToWorktree?: string[];
  timeoutMs?: number;
  planOnly?: boolean;
}
