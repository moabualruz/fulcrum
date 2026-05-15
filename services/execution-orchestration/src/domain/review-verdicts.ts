export type ReviewType = "plan" | "code" | "spec";
export type ReviewVerdict = "APPROVE" | "REVISE" | "RETHINK" | "UNAVAILABLE";
export type TrackedCodeReviewVerdict = "REVISE";
export type CodeReviewVerdictState = ReadonlyMap<number, TrackedCodeReviewVerdict>;

export interface ReviewVerdictEvent {
  stepIndex: number;
  reviewType: ReviewType;
  verdict: ReviewVerdict;
}

export interface StepDoneBlockerInput {
  stepNumber: number;
}

export interface ReviewToolResponseInput {
  stepIndex: number;
  stepName: string;
  reviewType: ReviewType;
  verdict: ReviewVerdict;
  review: string;
}

export interface RethinkRecoveryInput {
  stepIndex: number;
  reviewType: ReviewType;
  baseline?: string | null;
  checkpointId?: string | null;
  review: string;
  summary?: string | null;
}

export interface RethinkRecoveryPlan {
  gitResetBaseline?: string;
  rewindCheckpointId?: string;
  branchFallbackSummary?: string;
  resetStepStatus: {
    stepIndex: number;
    status: "pending";
  };
  logAction: string;
  logSummary?: string;
  responseText: string;
}

export function extractReviewVerdict(review: string): ReviewVerdict {
  const jsonMatch = review.match(
    /\{\s*"verdict"\s*:\s*"(APPROVE|REVISE|RETHINK)"\s*\}/i,);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].toUpperCase() as ReviewVerdict;
  }

  const headingMatch = review.match(
    /^[>\s]*(?:###?\s*|[*_]{1,2})Verdict[:\s]*[*_]{0,2}\s*(APPROVE|REVISE|RETHINK)\b/im,);
  if (headingMatch?.[1]) {
    return headingMatch[1].toUpperCase() as ReviewVerdict;
  }

  const lineFallback = review.match(
    /^[>\s]*(?:verdict|decision)\s*[-:]\s*(APPROVE|REVISE|RETHINK)\b/im,);
  if (lineFallback?.[1]) {
    return lineFallback[1].toUpperCase() as ReviewVerdict;
  }

  return "UNAVAILABLE";
}

export function recordReviewVerdict(
  currentState: CodeReviewVerdictState,
  event: ReviewVerdictEvent,): Map<number, TrackedCodeReviewVerdict> {
  const nextState = new Map(currentState);

  if (event.reviewType !== "code") {
    return nextState;
  }

  if (event.verdict === "REVISE") {
    nextState.set(event.stepIndex, "REVISE");
  } else if (event.verdict === "APPROVE") {
    nextState.delete(event.stepIndex);
  }

  return nextState;
}

export function getCodeReviewDoneBlocker(
  currentState: CodeReviewVerdictState,
  input: StepDoneBlockerInput,): string | undefined {
  const stepIndex = input.stepNumber - 1;
  if (currentState.get(stepIndex) !== "REVISE") {
    return undefined;
  }

  return `Cannot mark Step ${input.stepNumber} as done - the last code review returned REVISE. `
    + "Fix the issues from the code review, commit your changes, and call "
    + `fn_review_step(step=${input.stepNumber}, type="code") again. The step can only advance `
    + "after the code review passes.";
}

export function shouldAutoMarkStepDoneAfterReview(input: {
  reviewType: ReviewType;
  verdict: ReviewVerdict;
}): boolean {
  return input.reviewType === "code" && input.verdict === "APPROVE";
}

export function buildReviewToolResponse(input: ReviewToolResponseInput): string {
  switch (input.verdict) {
    case "APPROVE":
      return "APPROVE";
    case "REVISE":
      if (input.reviewType === "code") {
        return "REVISE - this step cannot be marked done until the code review passes.\n\n"
          + `Fix the issues below, commit your changes, and call fn_review_step(step=${input.stepIndex}, `
          + `type="code", step_name="${input.stepName}", baseline="<new SHA>") again.\n\n`
          + input.review;
      }
      return `REVISE\n\n${input.review}`;
    case "RETHINK":
      return buildRethinkResponseText(input.reviewType, input.review);
    case "UNAVAILABLE":
      return "UNAVAILABLE - reviewer did not produce a usable verdict.";
  }
}

export function planRethinkRecovery(input: RethinkRecoveryInput): RethinkRecoveryPlan {
  const checkpointId = input.checkpointId?.trim() || undefined;
  const baseline = input.reviewType === "code" ? input.baseline?.trim() || undefined : undefined;

  return {...(baseline ? { gitResetBaseline: baseline } : {}),...(checkpointId ? { rewindCheckpointId: checkpointId } : {}),
    branchFallbackSummary: `RETHINK: ${input.summary || "Approach rejected by reviewer"}`,
    resetStepStatus: {
      stepIndex: input.stepIndex,
      status: "pending",
    },
    logAction: input.reviewType === "plan"
      ? `RETHINK: Step ${input.stepIndex} plan rewound - session checkpoint ${checkpointId || "N/A"}`
      : `RETHINK: Step ${input.stepIndex} rewound - git reset to ${baseline || "N/A"}, session checkpoint ${checkpointId || "N/A"}`,...(input.summary ? { logSummary: input.summary } : {}),
    responseText: buildRethinkResponseText(input.reviewType, input.review),
  };
}

function buildRethinkResponseText(reviewType: ReviewType, review: string): string {
  if (reviewType === "plan") {
    return `RETHINK\n\nYour plan was rejected. Here is why:\n\n${review}\n\n`
      + "Take a different approach to planning this step. Do NOT repeat the rejected strategy.";
  }

  return `RETHINK\n\nYour previous approach was rejected. Here is why:\n\n${review}\n\n`
    + "Take a different approach. Do NOT repeat the rejected strategy. "
    + "Re-read the step requirements and find an alternative solution.";
}
