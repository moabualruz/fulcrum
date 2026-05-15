import type { ReviewVerdict } from "@execution-orchestration/domain/review-verdicts.ts";

export const EMPTY_REVIEW_FEEDBACK_MESSAGE =
  "No reviewer feedback yet - this task has not produced reviewer-agent feedback in direct mode.";

const REVIEW_BLOCK_RE = /##\s+(Code|Plan)\s+Review:[\s\S]*?(?=\n##\s+(?:Code|Plan)\s+Review:|$)/gi;
const REVIEW_VERDICT_RE = /###\s+Verdict:\s*(APPROVE|REVISE|RETHINK|UNAVAILABLE)\b/i;
const REVIEW_STEP_RE = /^(plan|code) review Step (\d+): (APPROVE|REVISE|RETHINK|UNAVAILABLE)\b/i;

export type TaskReviewerType = "plan" | "code";

export interface TaskLogEntry {
  timestamp: string;
  action: string;
}

export interface ReviewAgentLogEntry {
  timestamp: string;
  taskId: string;
  type: string;
  text: string;
  agent: string;
}

export interface ReviewFeedTask {
  id: string;
  updatedAt: string;
  log?: TaskLogEntry[];
}

export interface TaskReviewSummary {
  verdict?: ReviewVerdict;
  reviewType?: TaskReviewerType;
  summary?: string;
}

export interface TaskReviewItem {
  itemId: string;
  sourceMode: "reviewer-agent";
  title: string;
  body: string;
  author: "reviewer-agent";
  createdAt: string | null;
  updatedAt: string | null;
  reviewState: ReviewVerdict | null;
  progressStatus: "queued" | "in-progress" | "addressed" | "failed" | null;
}

export interface TaskReviewData {
  mode: "reviewer-agent";
  refreshable: true;
  fetchedAt: string | null;
  summary: TaskReviewSummary | null;
  items: TaskReviewItem[];
}

export interface BuildDirectTaskReviewDataInput {
  task: ReviewFeedTask;
  agentLogs: ReviewAgentLogEntry[];
  fetchedAt?: string | null;
}

export function buildDirectTaskReviewData(input: BuildDirectTaskReviewDataInput): TaskReviewData {
  const reviewerText = input.agentLogs.filter((entry) => entry.agent === "reviewer" && entry.type === "text").map((entry) => entry.text).join("\n");
  const fallbackLogs = (input.task.log ?? []).filter((entry) => REVIEW_STEP_RE.test(entry.action));

  const items: TaskReviewItem[] = [];
  const blocks = reviewerText.match(REVIEW_BLOCK_RE) ?? [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] ?? "";
    const reviewType = extractReviewTypeFromBlock(block);
    const verdict = extractFeedVerdict(block);
    const fallback = fallbackLogs[index];
    const createdAt = fallback?.timestamp ?? input.task.updatedAt;
    items.push({
      itemId: buildReviewerAgentItemId({ index, reviewType, verdict, createdAt }),
      sourceMode: "reviewer-agent",
      title: `${reviewType} review ${verdict ?? "feedback"}`,
      body: block.trim(),
      author: "reviewer-agent",
      createdAt,
      updatedAt: createdAt,
      reviewState: verdict ?? null,
      progressStatus: null,
    });
  }

  if (items.length === 0) {
    for (let index = 0; index < fallbackLogs.length; index += 1) {
      const entry = fallbackLogs[index];
      if (!entry) continue;
      const match = entry.action.match(REVIEW_STEP_RE);
      const reviewType = match?.[1]?.toLowerCase() === "plan" ? "plan" : "code";
      const step = match?.[2] ? Number.parseInt(match[2], 10) : undefined;
      const verdict = normalizeFeedVerdict(match?.[3]);
      items.push({
        itemId: buildReviewerAgentItemId({ index, reviewType, step, verdict, createdAt: entry.timestamp }),
        sourceMode: "reviewer-agent",
        title: `${reviewType} review ${verdict ?? "feedback"}`,
        body: entry.action,
        author: "reviewer-agent",
        createdAt: entry.timestamp,
        updatedAt: entry.timestamp,
        reviewState: verdict ?? null,
        progressStatus: null,
      });
    }
  }

  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  const latest = sorted[0];
  const summary: TaskReviewSummary | null = latest
    ? {
        summary: latest.title,...(latest.reviewState ? { verdict: latest.reviewState } : {}),
      }
    : null;

  return {
    mode: "reviewer-agent",
    refreshable: true,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    summary,
    items: sorted,
  };
}

function buildReviewerAgentItemId(input: {
  index: number;
  reviewType: TaskReviewerType;
  step?: number;
  verdict?: ReviewVerdict;
  createdAt?: string | null;
}): string {
  const stepPart = input.step ? `step-${input.step}` : "step-na";
  const verdictPart = (input.verdict ?? "unknown").toLowerCase();
  const timePart = (input.createdAt ?? "na").replace(/[:.]/g, "-");
  return `reviewer-${input.reviewType}-${stepPart}-${verdictPart}-${timePart}-${input.index + 1}`;
}

function extractReviewTypeFromBlock(block: string): TaskReviewerType {
  const typeMatch = block.match(/##\s+(Code|Plan)\s+Review:/i);
  return typeMatch?.[1]?.toLowerCase() === "plan" ? "plan" : "code";
}

function extractFeedVerdict(block: string): ReviewVerdict | undefined {
  return normalizeFeedVerdict(block.match(REVIEW_VERDICT_RE)?.[1]);
}

function normalizeFeedVerdict(value: string | undefined): ReviewVerdict | undefined {
  const upper = value?.toUpperCase();
  return upper === "APPROVE" || upper === "REVISE" || upper === "RETHINK" || upper === "UNAVAILABLE"
    ? upper
    : undefined;
}
