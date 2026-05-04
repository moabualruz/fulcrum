// Plane → Fulcrum field mapping.

import type { FulcrumTask } from "./types.ts";

/** Plane issue shape (partial). */
export interface PlaneIssue {
  id: string;
  name: string;
  description_html?: string | null;
  state?: string | null;        // state id or name
  state_detail?: { name: string } | null;
  priority?: string | null;    // "urgent" | "high" | "medium" | "low" | "none"
  assignees?: string[];         // user ids
  assignee_details?: Array<{ display_name: string }>;
  label_details?: Array<{ name: string }>;
  due_date?: string | null;
  estimate_point?: number | null;
}

function mapPlanePriority(priority: string | null | undefined): number {
  switch (priority?.toLowerCase()) {
    case "urgent": return 0;
    case "high": return 1;
    case "medium": return 2;
    case "low": return 3;
    default: return 2;
  }
}

export function mapPlaneIssue(issue: PlaneIssue): FulcrumTask {
  const assignee =
    issue.assignee_details?.[0]?.display_name ?? null;

  return {
    title: issue.name,
    description: issue.description_html ?? "",
    status: issue.state_detail?.name ?? issue.state ?? "pending",
    priority: mapPlanePriority(issue.priority),
    assignee,
    labels: issue.label_details?.map((l) => l.name) ?? [],
    due_date: issue.due_date ?? null,
    estimate: issue.estimate_point ?? null,
    custom_fields: { plane_issue_id: issue.id },
  };
}
