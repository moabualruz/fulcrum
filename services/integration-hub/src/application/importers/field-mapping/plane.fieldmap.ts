/**
 * Plane → Fulcrum field mapping.
 *
 * Maps Plane API issue fields to ImportedTask.
 * Pillar 17 issue 15.
 */

import type { ImportedTask } from "./types.ts";

/** Shape of a Plane issue from the API. */
export interface PlaneIssue {
  id: string;
  name: string;
  description_html?: string | null;
  state_detail?: { name: string } | null;
  priority?: string | null; // "urgent" | "high" | "medium" | "low" | "none"
  assignee_detail?: { display_name: string } | null;
  label_detail?: Array<{ name: string }> | null;
  target_date?: string | null;
  estimate_point?: number | null;
}

export function mapPlaneIssue(issue: PlaneIssue): ImportedTask {
  return {
    title: issue.name,
    description: issue.description_html ?? "",
    status: issue.state_detail?.name ?? "Unknown",
    priority: issue.priority ?? "none",
    assignee: issue.assignee_detail?.display_name ?? null,
    labels: issue.label_detail?.map((l) => l.name) ?? [],
    dueDate: issue.target_date ?? null,
    estimate: issue.estimate_point ?? null,
    customFields: { plane_issue_id: issue.id },
  };
}
