/**
 * Guard test: no file in the Fulcrum workspace should call bare `ulid()`
 * to generate a first-class object ID. All ID generation must flow through
 * `newId(<type>)` so the prefix system stays centralized (spec §6.1).
 *
 * See phase-4-validated.md K-1 / K-2 / K-4 for the history of bugs this
 * catches. Three separate files had to be patched in Rounds 3 and 4
 * because they each used `const foo_id = ulid()` (or `'prefix_' + ulid()`)
 * instead of `newId()`. This test prevents the fourth occurrence from
 * ever shipping.
 *
 * If you're adding a new `ulid()` call for legitimate reasons (e.g.,
 * internal sub-object identifiers in packages/memory/src/graph.ts),
 * add the file to ALLOWED_PATHS below with a one-line justification.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = (() => {
  // Walk up from this test file to the repo root (packages/core/src/tests/* → repo root is 4 up)
  return join(__filename, '..', '..', '..', '..', '..')
})()

/**
 * Files where `ulid()` may be called directly.
 * Add new entries only with a clear justification — a reviewer should be
 * able to read this list and understand why each is exempt.
 */
const ALLOWED_PATHS: Array<{ path: string; reason: string }> = [
  {
    path: 'packages/core/src/ids.ts',
    reason: 'Canonical newId() implementation — wraps ulid() by design.',
  },
  {
    path: 'packages/memory/src/ingest.ts',
    reason:
      'code_chunks.chunk_id is an internal, unprefixed identifier for a sub-object owned by the ingest pipeline — no registered prefix in ids.ts.',
  },
  {
    path: 'packages/sync/src/sync-manager.ts',
    reason:
      'sync_id / queueId / conflictId are internal identifiers for sync_states, sync_queue, sync_conflicts tables — no registered prefix in ids.ts. If these become user-visible, promote to newId().',
  },
  {
    path: 'packages/monitor/src/metrics.ts',
    reason:
      'analytics_daily row id uses an unregistered adm_ prefix. Internal analytics row identifier; if promoted, add adm prefix to PREFIXES and switch to newId("analytics_daily").',
  },
  {
    path: 'packages/memory/src/eval/fixtures.ts',
    reason:
      'ulid() appears as a string literal inside fixture document content (describing how newId() works), not as an actual function call — the regex cannot distinguish string content from code.',
  },
]

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tests') continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      yield full
    }
  }
}

function findUlidCalls(content: string): number[] {
  const lines = content.split('\n')
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match bare ulid() — permit `ulid(...)` with args if ever needed, we're looking for the zero-arg function call.
    // Skip comment lines.
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    // Look for `ulid(` but NOT preceded by an alpha/underscore (which would mean it's e.g. `myulid(` or a property chain)
    if (/(^|[^a-zA-Z_])ulid\s*\(/.test(line)) {
      hits.push(i + 1)
    }
  }
  return hits
}

describe('no bare ulid() calls outside allowlist (K-1/K-2/K-4 guard)', () => {
  it('every packages/*/src/**/*.ts file either uses newId() or is in ALLOWED_PATHS', () => {
    const packagesDir = join(REPO_ROOT, 'packages')
    const violations: Array<{ file: string; lines: number[] }> = []

    for (const absPath of walk(packagesDir)) {
      const rel = relative(REPO_ROOT, absPath).replaceAll('\\', '/')
      const allowed = ALLOWED_PATHS.some((a) => a.path === rel)
      if (allowed) continue
      const content = readFileSync(absPath, 'utf8')
      const hits = findUlidCalls(content)
      if (hits.length > 0) {
        violations.push({ file: rel, lines: hits })
      }
    }

    if (violations.length > 0) {
      const msg = violations.map((v) => `  ${v.file}:${v.lines.join(',')}`).join('\n')
      throw new Error(
        `Found ${violations.length} file(s) calling ulid() directly outside the allowlist:\n${msg}\n\n` +
          `All first-class ID generation must go through newId(<type>) from @moabualruz/fulcrum-core. ` +
          `If a new case is legitimately internal, add it to ALLOWED_PATHS in packages/core/src/tests/ulid-guard.test.ts with a justification.`,
      )
    }

    // Sanity check: the allowlist should actually match real files.
    for (const a of ALLOWED_PATHS) {
      const abs = join(REPO_ROOT, a.path)
      try {
        readFileSync(abs, 'utf8')
      } catch {
        throw new Error(`ALLOWED_PATHS entry does not exist: ${a.path}`)
      }
    }
  })

  it('every allowed path actually contains at least one ulid() call (allowlist entry stays live)', () => {
    for (const a of ALLOWED_PATHS) {
      const abs = join(REPO_ROOT, a.path)
      const content = readFileSync(abs, 'utf8')
      const hits = findUlidCalls(content)
      expect(
        hits.length,
        `${a.path} is allowlisted but doesn't call ulid() anymore — remove the allowlist entry.`,
      ).toBeGreaterThan(0)
    }
  })
})
