/**
 * Guard test: no file in the Fulcrum workspace should compare a role string
 * directly (e.g., `role === 'chief_of_staff'` or `role !== 'integration_worker'`).
 * All role checks must go through the capability helpers in roles.ts —
 * isL1 / canInvokeTeams / canMerge / canWriteCode / canEditFiles —
 * so role boundaries stay centralized and future new roles inherit the
 * correct flags automatically.
 *
 * See phase-5-validated (forthcoming) for the Round 5 bugs this catches.
 * Three separate files (worktrees.ts, monitor/server.ts, cli/index.ts) had
 * hardcoded string compares that silently bypassed the central lookup.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = join(__filename, '..', '..', '..', '..', '..')

const CANONICAL_ROLE_LITERALS = [
  'chief_of_staff',
  'context_gatherer',
  'prd_planner',
  'implementation_planner',
  'issue_decomposer',
  'software_engineer',
  'research_worker',
  'refactor_worker',
  'browser_worker',
  'data_engineer',
  'ml_engineer',
  'devops_engineer',
  'architecture_reviewer',
  'code_reviewer',
  'qa_engineer',
  'security_reviewer',
  'integration_worker',
  'documentation_writer',
  'memory_curator',
  'tech_lead',
  'product_manager',
  'analyst',
  'orchestrator',
]

/**
 * Files where direct role-string comparisons are legitimate.
 * Add new entries only with a clear justification.
 */
const ALLOWED_PATHS: Array<{ path: string; reason: string }> = [
  {
    path: 'packages/core/src/roles.ts',
    reason: 'Canonical roleCapabilities() implementation — defines the mappings.',
  },
  {
    path: 'packages/core/src/types.ts',
    reason: 'Canonical AgentRole type union — lists every role as a string literal.',
  },
  {
    path: 'packages/core/src/status.ts',
    reason: 'listAgentProfiles() builds the hardcoded profile list keyed by role slug.',
  },
  // Add more here only if reviewer agrees the usage is truly descriptive-not-enforcement.
]

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tests') continue
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) yield* walk(full)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) yield full
  }
}

/** Find `=== 'role_slug'` / `!== 'role_slug'` with a quoted canonical role. */
function findRoleStringCompares(content: string): Array<{ line: number; text: string }> {
  const lines = content.split('\n')
  const hits: Array<{ line: number; text: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    for (const role of CANONICAL_ROLE_LITERALS) {
      // Match patterns like ===|!==|== 'role' or "role"
      const pattern = new RegExp(
        String.raw`(===|!==|==|!=)\s*['"]${role}['"]|['"]${role}['"]\s*(===|!==|==|!=)`
      )
      if (pattern.test(line)) {
        hits.push({ line: i + 1, text: trimmed.slice(0, 120) })
        break // one hit per line is enough
      }
    }
  }
  return hits
}

describe('no hardcoded role string compares outside allowlist (P5-001..003 guard)', () => {
  it('every packages/*/src/**/*.ts file uses isL1/canInvokeTeams/canMerge/etc instead of direct role compares', () => {
    const packagesDir = join(REPO_ROOT, 'packages')
    const violations: Array<{ file: string; hits: Array<{ line: number; text: string }> }> = []

    for (const absPath of walk(packagesDir)) {
      const rel = relative(REPO_ROOT, absPath).replaceAll('\\', '/')
      const allowed = ALLOWED_PATHS.some(a => a.path === rel)
      if (allowed) continue
      const content = readFileSync(absPath, 'utf8')
      const hits = findRoleStringCompares(content)
      if (hits.length > 0) violations.push({ file: rel, hits })
    }

    if (violations.length > 0) {
      const msg = violations
        .flatMap(v => v.hits.map(h => `  ${v.file}:${h.line}  ${h.text}`))
        .join('\n')
      throw new Error(
        `Found hardcoded role string compares outside the allowlist:\n${msg}\n\n` +
        `Use isL1 / canInvokeTeams / canMerge / canWriteCode / canEditFiles from @moabualruz/fulcrum-core instead. ` +
        `If a new case is legitimately descriptive-only, add it to ALLOWED_PATHS with a justification.`
      )
    }

    // Sanity check: every allowlist entry must exist
    for (const a of ALLOWED_PATHS) {
      const abs = join(REPO_ROOT, a.path)
      try { readFileSync(abs, 'utf8') } catch {
        throw new Error(`ALLOWED_PATHS entry does not exist: ${a.path}`)
      }
    }
  })
})
