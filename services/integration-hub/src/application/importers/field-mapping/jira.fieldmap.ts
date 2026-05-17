/**
 * Jira → Fulcrum field mapping.
 *
 * Maps Jira REST API v3 /rest/api/3/search fields to ImportedTask.
 * Pillar 17 issue 15.
 */

import type { ImportedTask } from "./types.ts";

/** Shape of a Jira issue from REST v3. */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status?: { name: string } | null;
    priority?: { name: string } | null;
    reporter?: { displayName: string; emailAddress?: string } | null;
    assignee?: { displayName: string } | null;
    labels?: string[];
    duedate?: string | null;
    // story_points stored in customfield — common field id
    [key: string]: unknown;
  };
}

/** Extract story_points from common Jira custom field locations. */
function extractStoryPoints(fields: JiraIssue["fields"]): number | null {
  // Standard Jira story points field
  const sp = fields["story_points"] ?? fields["customfield_10016"] ?? fields["customfield_10028"];
  if (typeof sp === "number") return sp;
  return null;
}

/** Jira description can be ADF (object) or string. Extract plain text. */
function flattenDescription(desc: unknown): string {
  if (typeof desc === "string") return desc;
  if (desc && typeof desc === "object" && "content" in (desc as Record<string, unknown>)) {
    // Simplified ADF text extraction — joins all text nodes
    return extractAdfText(desc);
  }
  return "";
}

function extractAdfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(extractAdfText).join("");
  }
  return "";
}

export function mapJiraIssue(issue: JiraIssue): ImportedTask {
  const f = issue.fields;
  return {
    title: f.summary,
    description: flattenDescription(f.description),
    status: f.status?.name ?? "Unknown",
    priority: f.priority?.name?.toLowerCase() ?? "none",
    // Jira: reporter → Fulcrum assignee (per acceptance criteria)
    assignee: f.reporter?.displayName ?? null,
    labels: f.labels ?? [],
    dueDate: f.duedate ?? null,
    estimate: extractStoryPoints(f),
    customFields: { jira_issue_id: issue.key },
  };
}
