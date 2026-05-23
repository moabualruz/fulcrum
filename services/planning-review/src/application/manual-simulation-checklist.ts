import type {
  FinalQaTaskResult,
  ManualSimulationChecklist,
  ManualSimulationFeedbackAnnotation,
  ManualSimulationStep,
  ManualSimulationStepResult,
} from "@planning-review/domain/review-acceptance.ts";

export interface BuildManualSimulationChecklistInput {
  projectId: string;
  traceId?: string;
  tasks: FinalQaTaskResult[];
  approvedForE2e?: boolean;
}

export interface RecordManualSimulationStepResultInput {
  checklist: ManualSimulationChecklist;
  stepId: string;
  status: ManualSimulationStepResult["status"];
  evidence: string;
}

export function buildManualSimulationChecklist(
  input: BuildManualSimulationChecklistInput,
): ManualSimulationChecklist {
  const tasks = input.tasks.length > 0 ? input.tasks : [fallbackProjectTask(input.projectId)];
  const steps = tasks.flatMap((task) => buildStepsForTask(task));
  return {
    id: `manual-simulation:${input.traceId ?? input.projectId}`,
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    status: input.approvedForE2e ? "approved" : "pending",
    steps,
    e2eSeed: {
      sourceTaskIds: [...new Set(steps.map((step) => step.taskId))],
      sourceCriteria: steps.map((step) => step.criterion),
      approvedForE2e: input.approvedForE2e === true,
    },
  };
}

export function recordManualSimulationStepResult(
  input: RecordManualSimulationStepResultInput,
): ManualSimulationStepResult {
  const step = input.checklist.steps.find((candidate) => candidate.id === input.stepId);
  if (!step) throw new Error(`Manual simulation step ${input.stepId} was not found.`);
  const evidence = input.evidence.trim();
  const result: ManualSimulationStepResult = {
    stepId: step.id,
    status: input.status,
    evidence,
  };
  if (input.status === "failed") {
    result.feedbackAnnotation = buildFeedbackAnnotation(step, evidence);
  }
  return result;
}

function buildStepsForTask(task: FinalQaTaskResult): ManualSimulationStep[] {
  const criteria = task.successCriteria.length > 0 ? task.successCriteria : [`${task.title} remains user-visible.`];
  return criteria.map((criterion, index) => {
    const ordinal = index + 1;
    return {
      id: `${task.taskId}:manual-simulation:${ordinal}`,
      taskId: task.taskId,
      taskTitle: task.title,
      criterion,
      setup: `Open the workflow state for ${task.title}.`,
      action: `Exercise the user-visible path for success criterion ${ordinal}.`,
      expectedObservation: criterion,
      evidenceField: `evidence.${task.taskId}.${ordinal}`,
    };
  });
}

function buildFeedbackAnnotation(step: ManualSimulationStep, evidence: string): ManualSimulationFeedbackAnnotation {
  return {
    id: `${step.id}:feedback`,
    stepId: step.id,
    taskId: step.taskId,
    title: `Manual simulation failed: ${step.taskTitle}`,
    body: [
      `Criterion: ${step.criterion}`,
      `Expected observation: ${step.expectedObservation}`,
      `Evidence: ${evidence || "No evidence supplied."}`,
    ].join("\n"),
    severity: "blocking",
  };
}

function fallbackProjectTask(projectId: string): FinalQaTaskResult {
  return {
    taskId: projectId,
    title: "Project acceptance",
    status: null,
    successCriteria: ["Project acceptance approved."],
    latestVerdict: "APPROVE",
    latestReviewEventId: null,
    unresolvedDependencyIds: [],
    runIds: [],
    openFeedbackRunIds: [],
    artifactIds: [],
  };
}
