// Jira → Fulcrum field mapping.

import type { FulcrumTask } from "./types.ts";

/** Jira issue shape (partial — REST API v3). */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: { name: string } | null;
    priority?: { name: string } | null;
    reporter?: { displayName: string } | null;
    assignee?: { displayName: string } | null;
    labels?: string[];
    duedate?: string | null;
    story_points?: number | null;
    customfield_10016?: number | null; // Story Points (common Jira field id)
  };
}

function mapJiraPriority(name: string | undefined): number {
  switch (name?.toLowerCase()) {
    case "highest":
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 2;
  }
}

export function mapJiraIssue(issue: JiraIssue): FulcrumTask {
  const f = issue.fields;
  const storyPoints =
    f.story_points ??
    f.customfield_10016 ??
    null;

  return {
    title: f.summary,
    description: f.description ?? "",
    status: f.status?.name ?? "pending",
    priority: mapJiraPriority(f.priority?.name),
    assignee: f.reporter?.displayName ?? f.assignee?.displayName ?? null,
    labels: f.labels ?? [],
    due_date: f.duedate ?? null,
    estimate: storyPoints,
    custom_fields: {
      jira_issue_id: issue.id,
      jira_issue_key: issue.key,
    },
  };
}
