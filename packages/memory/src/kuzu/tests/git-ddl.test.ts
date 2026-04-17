// v2b PR 10 Task 1.2 — git node DDL tests.

import { describe, it, expect } from 'vitest'
import { buildGitDDL } from '../schema.js'

describe('buildGitDDL — v2b PR 10 Task 1.2', () => {
  it('returns an array of 4 DDL strings', () => {
    const ddls = buildGitDDL()
    expect(ddls).toHaveLength(4)
  })

  it('covers git_commit, git_branch, git_pr, git_tag', () => {
    const ddls = buildGitDDL()
    const tables = ['GitCommit', 'GitBranch', 'GitPr', 'GitTag']
    for (const t of tables) {
      expect(ddls.some(d => d.includes(`CREATE NODE TABLE IF NOT EXISTS ${t}`)), `Missing ${t}`).toBe(true)
    }
  })

  it('every DDL has PRIMARY KEY (id)', () => {
    for (const ddl of buildGitDDL()) {
      expect(ddl).toContain('PRIMARY KEY (id)')
    }
  })

  it('git_commit has sha, message, author, workspace_id', () => {
    const commitDdl = buildGitDDL().find(d => d.includes('GitCommit'))!
    for (const col of ['sha', 'message', 'author', 'workspace_id']) {
      expect(commitDdl, `commit col ${col} missing`).toContain(col)
    }
  })

  it('git_pr has number, title, state', () => {
    const prDdl = buildGitDDL().find(d => d.includes('GitPr'))!
    for (const col of ['number', 'title', 'state']) {
      expect(prDdl, `git_pr col ${col} missing`).toContain(col)
    }
  })
})
