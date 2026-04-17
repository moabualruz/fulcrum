// v2a PR 4 Task 21 — gitignore-respecting walker integration.
//
// In git repos:   `getGitFiles()` is the source-of-truth file list.
// Outside git:    hierarchical walker from the hierarchical walker applies
//                 .gitignore + .fulcrumignore + DEFAULT_IGNORE_PATTERNS.
//
// Always:
//   - hidden files + dirs are filtered out
//   - files > 1 MiB are skipped (size guard)
//   - binary files excluded via extension heuristic
//   - node_modules/.fulcrum/dist/build/.turbo/target never traversed

import { statSync } from 'node:fs'
import { join, basename, extname, relative, isAbsolute } from 'node:path'
import { walk } from './walker.js'
import { getGitFiles, isGitRepository } from './git-files.js'

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 // 1 MiB

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flac', '.wav',
  '.wasm', '.so', '.dylib', '.dll', '.exe', '.o', '.a',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
])

const HARD_EXCLUDE_DIRS = new Set(['node_modules', '.fulcrum', 'dist', 'build', '.turbo', 'target'])

function hasHiddenSegment(relPath: string): boolean {
  // Reject any path component that starts with '.' (hidden).
  // Allow '.' / '..' themselves — never emitted by the walker.
  for (const seg of relPath.split('/')) {
    if (seg.startsWith('.') && seg !== '.' && seg !== '..') return true
  }
  return false
}

function hasHardExcludeSegment(relPath: string): boolean {
  for (const seg of relPath.split('/')) {
    if (HARD_EXCLUDE_DIRS.has(seg)) return true
  }
  return false
}

export interface WalkerResult {
  /** Project-root-relative paths. Sorted for deterministic ordering. */
  files: string[]
  mode: 'git' | 'fs-walk'
  /** Number of files rejected by the size/binary/hidden filters. */
  skipped: number
}

/**
 * Enumerate project files respecting gitignore + size + binary filters.
 * Returns relative paths (POSIX style) sorted for deterministic output.
 */
export async function enumerateProjectFiles(rootDir: string): Promise<WalkerResult> {
  let mode: 'git' | 'fs-walk'
  let candidateFiles: string[]

  if (isGitRepository(rootDir)) {
    mode = 'git'
    candidateFiles = getGitFiles(rootDir)
  } else {
    mode = 'fs-walk'
    candidateFiles = []
    for await (const rel of walk(rootDir)) {
      candidateFiles.push(rel)
    }
  }

  let skipped = 0
  const kept: string[] = []

  for (const rel of candidateFiles) {
    const relNorm = rel.replace(/\\/g, '/')
    if (hasHiddenSegment(relNorm)) { skipped++; continue }
    if (hasHardExcludeSegment(relNorm)) { skipped++; continue }
    if (BINARY_EXTS.has(extname(relNorm).toLowerCase())) { skipped++; continue }

    const abs = isAbsolute(relNorm) ? relNorm : join(rootDir, relNorm)
    try {
      const stats = statSync(abs)
      if (!stats.isFile()) { skipped++; continue }
      if (stats.size > MAX_FILE_SIZE_BYTES) { skipped++; continue }
    } catch {
      // File disappeared between walker emit and stat — skip.
      skipped++
      continue
    }

    // Store project-root-relative.
    const finalRel = isAbsolute(relNorm) ? relative(rootDir, abs).replace(/\\/g, '/') : relNorm
    kept.push(finalRel)
  }

  kept.sort()
  return { files: kept, mode, skipped }
}

/**
 * Predicate form — test whether a single absolute path would be accepted
 * by the walker. Used by the PCI watcher to filter `fs.watch` events.
 */
export function shouldIndexPath(rootDir: string, absPath: string): boolean {
  const rel = relative(rootDir, absPath).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return false
  if (hasHiddenSegment(rel)) return false
  if (hasHardExcludeSegment(rel)) return false
  if (BINARY_EXTS.has(extname(basename(rel)).toLowerCase())) return false
  try {
    const stats = statSync(absPath)
    if (!stats.isFile()) return false
    if (stats.size > MAX_FILE_SIZE_BYTES) return false
  } catch { return false }
  return true
}
