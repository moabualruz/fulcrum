// PR 20 Task 11.1 — Git reducer for Kuzu graph.
//
// Writes git_commit / git_branch / git_pr / git_tag nodes + landed_in / on / includes edges.
// Two paths: (a) post-commit hook → fulcrum action exec record_commit;
//            (b) Dreaming light phase periodic git log walker for backfill.

import type { KuzuClient } from '../client.js'

export interface GitCommitInput {
  sha: string
  message: string
  author: string
  authored_at: string
  branch: string
  workspace_id: string
  project_id: string
  changed_files: string[]
  pr_number?: number
}

export interface GitBranchInput {
  name: string
  sha: string
  workspace_id: string
  project_id: string
  is_remote: boolean
}

export interface GitPrInput {
  pr_number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  head_sha: string
  workspace_id: string
  project_id: string
  author?: string
}

export interface GitTagInput {
  name: string
  sha: string
  workspace_id: string
  project_id: string
  message?: string
}

export async function reduceGitCommit(
  client: KuzuClient,
  input: GitCommitInput
): Promise<void> {
  if (!client.isReady) return

  try {
    // Upsert git_commit node
    await client.query(
      `CREATE (c:GitCommit {
        sha: $sha,
        message: $message,
        author: $author,
        authored_at: $authored_at,
        branch: $branch,
        workspace_id: $workspace_id,
        project_id: $project_id
      })`,
      {
        sha: input.sha,
        message: input.message.slice(0, 500),
        author: input.author,
        authored_at: input.authored_at,
        branch: input.branch,
        workspace_id: input.workspace_id,
        project_id: input.project_id,
      }
    )

    // landed_in edges from changed files to this commit
    for (const file of input.changed_files) {
      await client.query(
        `MATCH (f:File {path: $path}), (c:GitCommit {sha: $sha})
         CREATE (c)-[:LANDED_IN]->(f)`,
        { path: file, sha: input.sha }
      ).catch(() => { /* file node may not exist yet — best effort */ })
    }
  } catch {
    // Reducer errors never block ingest
  }
}

export async function reduceGitBranch(
  client: KuzuClient,
  input: GitBranchInput
): Promise<void> {
  if (!client.isReady) return

  try {
    await client.query(
      `CREATE (b:GitBranch {
        name: $name,
        sha: $sha,
        is_remote: $is_remote,
        workspace_id: $workspace_id,
        project_id: $project_id
      })`,
      {
        name: input.name,
        sha: input.sha,
        is_remote: input.is_remote,
        workspace_id: input.workspace_id,
        project_id: input.project_id,
      }
    )
  } catch { /* no-op */ }
}

export async function reduceGitPr(
  client: KuzuClient,
  input: GitPrInput
): Promise<void> {
  if (!client.isReady) return

  try {
    await client.query(
      `CREATE (p:GitPR {
        pr_number: $pr_number,
        title: $title,
        state: $state,
        head_sha: $head_sha,
        workspace_id: $workspace_id,
        project_id: $project_id,
        author: $author
      })`,
      {
        pr_number: input.pr_number,
        title: input.title.slice(0, 500),
        state: input.state,
        head_sha: input.head_sha,
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        author: input.author ?? null,
      }
    )

    // includes edge from PR to head commit
    await client.query(
      `MATCH (p:GitPR {pr_number: $pr_number}), (c:GitCommit {sha: $sha})
       CREATE (p)-[:INCLUDES]->(c)`,
      { pr_number: input.pr_number, sha: input.head_sha }
    ).catch(() => { /* best effort */ })
  } catch { /* no-op */ }
}

export async function reduceGitTag(
  client: KuzuClient,
  input: GitTagInput
): Promise<void> {
  if (!client.isReady) return

  try {
    await client.query(
      `CREATE (t:GitTag {
        name: $name,
        sha: $sha,
        workspace_id: $workspace_id,
        project_id: $project_id,
        message: $message
      })`,
      {
        name: input.name,
        sha: input.sha,
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        message: input.message ?? null,
      }
    )

    // delivered_in edge from tag to commit
    await client.query(
      `MATCH (t:GitTag {name: $name}), (c:GitCommit {sha: $sha})
       CREATE (t)-[:DELIVERED_IN]->(c)`,
      { name: input.name, sha: input.sha }
    ).catch(() => { /* best effort */ })
  } catch { /* no-op */ }
}
