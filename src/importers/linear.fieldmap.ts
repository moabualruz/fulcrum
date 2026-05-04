/**
 * Linear → Fulcrum field mapping.
 *
 * Maps Linear GraphQL IssueConnection fields to ImportedTask.
 * Pillar 17 issue 15.
 */

import type { ImportedTask } from "./types.ts";

/** Shape of a Linear issue from the GraphQL API. */
export interface LinearIssue {
  id: string;
  title: string;
  description?: string | null;
  state?: { name: string } | null;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  assignee?: { name: string; email?: string } | null;
  labels?: { nodes: Array<{ name: string }> } | null;
  dueDate?: string | null;
  estimate?: number | null;
}

const PRIORITY_MAP: Record<number, string> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

export function mapLinearIssue(issue: LinearIssue): ImportedTask {
  return {
    title: issue.title,
    description: issue.description ?? "",
    status: issue.state?.name ?? "Unknown",
    priority: PRIORITY_MAP[issue.priority] ?? "none",
    assignee: issue.assignee?.name ?? null,
    labels: issue.labels?.nodes?.map((l) => l.name) ?? [],
    dueDate: issue.dueDate ?? null,
    estimate: issue.estimate ?? null,
    customFields: { linear_issue_id: issue.id },
  };
}
