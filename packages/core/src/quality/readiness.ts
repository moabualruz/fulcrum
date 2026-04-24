import type { QualityGateDefinition, QualityGateResult } from "@fulcrum/shared";
import type { QualityGateRepositoryPort } from "./runner.js";

export interface ReadinessDecision {
  status: "ready" | "blocked" | "exception";
  requiredGateIds: string[];
  passingResultIds: string[];
  blockingGateIds: string[];
  exceptionReasons: string[];
  summary: string;
}

export class QualityReadinessEvaluator {
  constructor(private readonly repository: QualityGateRepositoryPort) {}

  evaluate(input: {
    projectId: string;
    runId?: string;
    taskId?: string;
    exceptions?: Record<string, string>;
  }): ReadinessDecision {
    const required = this.repository
      .listDefinitions(input.projectId)
      .filter((definition) => definition.required);
    const results = this.repository.listResults(input);
    const passingResultIds: string[] = [];
    const blockingGateIds: string[] = [];
    const exceptionReasons: string[] = [];

    for (const gate of required) {
      const latest = latestForGate(gate, results);
      if (latest?.status === "passed") {
        passingResultIds.push(latest.qualityGateResultId);
        continue;
      }
      const exception = input.exceptions?.[gate.gateId];
      if (exception) {
        exceptionReasons.push(`${gate.name}: ${exception}`);
        continue;
      }
      blockingGateIds.push(gate.gateId);
    }

    const status =
      blockingGateIds.length > 0 ? "blocked" : exceptionReasons.length > 0 ? "exception" : "ready";
    return {
      status,
      requiredGateIds: required.map((gate) => gate.gateId),
      passingResultIds,
      blockingGateIds,
      exceptionReasons,
      summary:
        status === "ready"
          ? "Required quality gates passed."
          : status === "exception"
            ? "Required quality gates have release exceptions."
            : "Required quality gate evidence missing or failing."
    };
  }
}

function latestForGate(
  gate: QualityGateDefinition,
  results: QualityGateResult[]
): QualityGateResult | undefined {
  return results
    .filter((result) => result.gateId === gate.gateId)
    .sort((left, right) => {
      const leftTime = left.completedAt ?? left.updatedAt;
      const rightTime = right.completedAt ?? right.updatedAt;
      return rightTime.localeCompare(leftTime);
    })[0];
}
