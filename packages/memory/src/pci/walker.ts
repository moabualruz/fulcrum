// License: Apache-2.0
//
// v2a PR 1 Task 7 — async hierarchical filesystem walker with stacked-scope
// .gitignore semantics. PR 4's PCI uses this when getGitFiles() can't (non-
// git directories). DEFAULT_IGNORE_PATTERNS from sibling ignore-patterns.ts
// is always applied; per-directory .gitignore / .fulcrumignore stacks add to
// it as the walker descends.

import type { Dirent } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { DEFAULT_IGNORE_PATTERNS } from './ignore-patterns.js'

interface WalkOptions {
  ignoreFiles?: string[]
  additionalPatterns?: string[]
}

interface IgnoreScope {
  filter: Ignore
  dir: string
}

async function getIgnoreFilter(dir: string, ignoreFiles: string[]): Promise<Ignore | null> {
  let filter: Ignore | null = null
  for (const fileName of ignoreFiles) {
    const ignorePath = path.join(dir, fileName)
    try {
      const content = await fs.readFile(ignorePath, 'utf-8')
      if (!filter) filter = ignore()
      filter.add(content)
    } catch {
      // missing files are normal
    }
  }
  return filter
}

export async function* walk(rootDir: string, options: WalkOptions = {}): AsyncGenerator<string> {
  const ignoreFiles = options.ignoreFiles || ['.gitignore', '.fulcrumignore']
  const rootParams = ignore().add(DEFAULT_IGNORE_PATTERNS)
  if (options.additionalPatterns) rootParams.add(options.additionalPatterns)

  const rootScope: IgnoreScope = { filter: rootParams, dir: rootDir }
  const stack: IgnoreScope[] = [rootScope]

  const rootGitIgnore = await getIgnoreFilter(rootDir, ignoreFiles)
  if (rootGitIgnore) stack.push({ filter: rootGitIgnore, dir: rootDir })

  yield* _walk(rootDir, rootDir, stack, ignoreFiles)
}

async function* _walk(
  currentDir: string,
  rootDir: string,
  stack: IgnoreScope[],
  ignoreFiles: string[],
): AsyncGenerator<string> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name)
    const relPathToRoot = path.relative(rootDir, absPath)

    let isIgnored = false
    for (const scope of stack) {
      const relToScope = path.relative(scope.dir, absPath)
      if (relToScope && scope.filter.ignores(relToScope)) {
        isIgnored = true
        break
      }
    }
    if (isIgnored) continue

    if (entry.isDirectory()) {
      const childIgnore = await getIgnoreFilter(absPath, ignoreFiles)
      if (childIgnore) {
        stack.push({ filter: childIgnore, dir: absPath })
        yield* _walk(absPath, rootDir, stack, ignoreFiles)
        stack.pop()
      } else {
        yield* _walk(absPath, rootDir, stack, ignoreFiles)
      }
    } else {
      yield relPathToRoot
    }
  }
}
