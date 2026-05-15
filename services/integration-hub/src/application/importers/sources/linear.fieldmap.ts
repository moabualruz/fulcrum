// Linear → Fulcrum field mapping.

import type { FulcrumTask } from "./types.ts";

/** Maps Linear priority number (0-4) → Fulcrum priority (0=urgent, 1=high, 2=medium, 3=low). */
function mapPriority(linearPriority: number): number {
  // Linear: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
  // Fulcrum: 0=Urgent, 1=High, 2=Medium, 3=Low, 4=None
  return linearPriority; // 1:1 pass-through; 0 maps to "no priority" → use 4
}

/** Linear issue shape (partial). */
export interface LinearIssue {
  id: string;
  title: string;
  description?: string | null;
  state?: { name: string } | null;
  priority?: number;
  assignee?: { name: string } | null;
  labels?: { nodes: Array<{ name: string }> };
  dueDate?: string | null;
}

export function mapLinearIssue(issue: LinearIssue): FulcrumTask {
  return {
    title: issue.title,
    description: issue.description ?? "",
    status: issue.state?.name ?? "pending",
    priority: mapPriority(issue.priority ?? 0),
    assignee: issue.assignee?.name ?? null,
    labels: issue.labels?.nodes.map((l) => l.name) ?? [],
    due_date: issue.dueDate ?? null,
    estimate: null,
    custom_fields: { linear_issue_id: issue.id },
  };
}
