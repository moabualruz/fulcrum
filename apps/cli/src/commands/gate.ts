import { makeId } from "@fulcrum/shared";
import type { QualityGateRunner, QualityReadinessEvaluator } from "@fulcrum/core";

export interface GateCommandDeps {
  runner: QualityGateRunner;
  readiness: QualityReadinessEvaluator;
}

export function defineGateCommand(
  deps: GateCommandDeps,
  input: {
    projectId: string;
    name: string;
    command: string;
    required?: boolean;
    timeoutMs?: number;
  }
) {
  return deps.runner.define({
    gateId: makeId("gate", `${input.projectId}-${input.name}`),
    projectId: input.projectId,
    name: input.name,
    command: input.command,
    required: input.required ?? false,
    timeoutMs: input.timeoutMs
  });
}

export function listGatesCommand(deps: GateCommandDeps, projectId: string) {
  return deps.runner.list(projectId);
}

export function listGateResultsCommand(
  deps: GateCommandDeps,
  input: { projectId: string; runId?: string; taskId?: string }
) {
  return deps.runner.results(input);
}

export function runGateCommand(
  deps: GateCommandDeps,
  input: {
    gateId: string;
    cwd: string;
    projectId?: string;
    taskId?: string;
    runId?: string;
    artifactRoot?: string;
    skip?: boolean;
  }
) {
  return deps.runner.run(input);
}

export function gateReadinessCommand(
  deps: GateCommandDeps,
  input: { projectId: string; runId?: string; taskId?: string; exceptions?: Record<string, string> }
) {
  return deps.readiness.evaluate(input);
}
