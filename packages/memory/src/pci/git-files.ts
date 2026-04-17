// License: Apache-2.0
//
// v2a PR 1 Task 8 — fast file enumeration via `git ls-files` for git repos.
// Returns project-root-relative paths (string[]). Caller decides what to do
// with non-git roots — the PR 4 walker falls back to the `ignore`-package
// hierarchical walker (the hierarchical walker — Task 7 lift).

import { spawnSync } from 'node:child_process'

/**
 * Runs `git ls-files -z` + `git ls-files --others --exclude-standard -z` and
 * returns the union as a deduplicated array of project-root-relative paths.
 * Returns an empty array if git is not available or `root` is not a repo.
 */
export function getGitFiles(root: string): string[] {
  const run = (args: string[]): string => {
    const res = spawnSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 1024, // 1 GiB — large monorepo headroom
    })
    if (res.error || res.status !== 0) return ''
    return (res.stdout as string) ?? ''
  }

  const tracked = run(['ls-files', '-z']).split('\u0000').filter(Boolean)
  const untracked = run(['ls-files', '--others', '--exclude-standard', '-z']).split('\u0000').filter(Boolean)
  return Array.from(new Set([...tracked, ...untracked]))
}

const gitRepoCache = new Map<string, boolean>()

/**
 * Cheap cached check: is `dir` inside a git working tree?
 * Uses `git rev-parse --git-dir`; cached per-process for the working set.
 */
export function isGitRepository(dir: string): boolean {
  const cached = gitRepoCache.get(dir)
  if (cached !== undefined) return cached
  let isGit = false
  try {
    const res = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: dir, encoding: 'utf-8' })
    isGit = res.status === 0 && !res.error
  } catch {
    isGit = false
  }
  gitRepoCache.set(dir, isGit)
  return isGit
}
