import { describe, it, expect, vi } from 'vitest'
import { reduceGitCommit, reduceGitBranch, type GitCommitInput, type GitBranchInput } from '../git.js'

function makeMockClient() {
  const ops: Array<{ op: string; args: unknown[] }> = []
  return {
    isReady: true,
    query: vi.fn().mockResolvedValue([]),
    ops,
  }
}

describe('reduceGitCommit', () => {
  it('upserts git_commit node and landed_in edge to target file', async () => {
    const client = makeMockClient()
    const input: GitCommitInput = {
      sha: 'abc123',
      message: 'feat: add auth middleware',
      author: 'Mo',
      authored_at: '2026-04-16T12:00:00Z',
      branch: 'main',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      changed_files: ['src/auth.ts', 'src/middleware.ts'],
    }
    await reduceGitCommit(client as Parameters<typeof reduceGitCommit>[0], input)
    // Should have called query for node upsert + landed_in edges
    expect(client.query).toHaveBeenCalled()
  })

  it('is a no-op when client is not ready', async () => {
    const client = { ...makeMockClient(), isReady: false }
    await reduceGitCommit(client as Parameters<typeof reduceGitCommit>[0], {
      sha: 'abc123',
      message: 'test',
      author: 'Mo',
      authored_at: '2026-04-16T12:00:00Z',
      branch: 'main',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      changed_files: [],
    })
    expect(client.query).not.toHaveBeenCalled()
  })
})

describe('reduceGitBranch', () => {
  it('upserts git_branch node', async () => {
    const client = makeMockClient()
    const input: GitBranchInput = {
      name: 'feat/auth',
      sha: 'abc123',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      is_remote: false,
    }
    await reduceGitBranch(client as Parameters<typeof reduceGitBranch>[0], input)
    expect(client.query).toHaveBeenCalled()
  })
})
