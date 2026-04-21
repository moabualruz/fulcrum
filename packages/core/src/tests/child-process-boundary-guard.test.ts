/**
 * Guard test: child_process usage must stay explicit and reviewed.
 *
 * Fulcrum's runtime agent execution belongs in @fulcrum/worker. Other packages
 * may still spawn local OS tools for their owned concern: git worktrees, install
 * probes, notifications, index helpers, workflow command steps, or explicitly
 * configured memory curator backends. This test prevents new process spawning
 * from appearing silently under a broad "it was already in the repo" excuse.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = join(__filename, '..', '..', '..', '..', '..')

const SCAN_ROOTS = ['packages', 'agent-integration', 'scripts']

const ALLOWED_EXACT: Array<{ path: string; reason: string }> = [
  {
    path: 'agent-integration/install.ts',
    reason: 'Installer probes host CLIs and invokes host install commands.',
  },
  {
    path: 'agent-integration/uninstall.ts',
    reason: 'Uninstaller replays rollback commands recorded by the installer.',
  },
  {
    path: 'agent-integration/opencode/plugins/fulcrum.ts',
    reason: 'opencode plugin invokes the local fulcrum CLI for hooks and actions.',
  },
  {
    path: 'agent-integration/pi/cockpit/index.ts',
    reason: 'PI cockpit invokes the local fulcrum CLI and opens browser/desktop helpers.',
  },
  {
    path: 'packages/cli/src/doctor.ts',
    reason: 'Doctor probes optional local dependencies.',
  },
  {
    path: 'packages/cli/src/index.ts',
    reason: 'CLI installer/plugin commands run package-manager and generated integration commands.',
  },
  {
    path: 'packages/cli/src/pi-cockpit.ts',
    reason: 'CLI launches the local PI cockpit entrypoint.',
  },
  {
    path: 'packages/core/src/notify.ts',
    reason: 'Desktop notifications use OS notification commands.',
  },
  {
    path: 'packages/core/src/runs.ts',
    reason: 'Run metadata captures current git branch and commit.',
  },
  {
    path: 'packages/fulcrum-mcp/src/index.ts',
    reason: 'Zero-install wrapper probes/executes local MCP command path.',
  },
  {
    path: 'packages/memory/src/indexer/client.ts',
    reason: 'PCI client autospawns the local indexer daemon.',
  },
  {
    path: 'packages/memory/src/l1/curator-backend/codex.ts',
    reason: 'Explicitly configured L1 curator backend talks to codex app-server.',
  },
  {
    path: 'packages/memory/src/pci/git-files.ts',
    reason: 'PCI git walker shells out to git for tracked file discovery.',
  },
  {
    path: 'packages/workflows/src/step-executor.ts',
    reason: 'Workflow command steps execute user-declared local commands.',
  },
  {
    path: 'packages/worktrees/src/worktrees.ts',
    reason: 'Worktree package owns git worktree allocation and removal.',
  },
  {
    path: 'scripts/import-claude-sessions.ts',
    reason: 'Operator import script rebuilds memory indexes after import.',
  },
]

const ALLOWED_PREFIXES: Array<{ prefix: string; reason: string }> = [
  {
    prefix: 'packages/worker/src/',
    reason: '@fulcrum/worker owns runtime agent adapter subprocess execution.',
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
    if (entry === '.git' || entry === 'dist' || entry === 'node_modules' || entry === 'tests') continue
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

function childProcessLines(content: string): number[] {
  const hits: number[] = []
  const patterns = [
    /\bfrom\s+['"](?:node:)?child_process['"]/,
    /\bimport\(\s*['"](?:node:)?child_process['"]\s*\)/,
    /\brequire\(\s*['"](?:node:)?child_process['"]\s*\)/,
  ]

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some((pattern) => pattern.test(lines[i]))) hits.push(i + 1)
  }
  return hits
}

function isAllowed(rel: string): boolean {
  return ALLOWED_EXACT.some((entry) => entry.path === rel)
    || ALLOWED_PREFIXES.some((entry) => rel.startsWith(entry.prefix))
}

describe('child_process boundary allowlist', () => {
  it('keeps process spawning in reviewed owner files', () => {
    const violations: Array<{ file: string; lines: number[] }> = []

    for (const root of SCAN_ROOTS) {
      for (const absPath of walk(join(REPO_ROOT, root))) {
        const rel = relative(REPO_ROOT, absPath).replaceAll('\\', '/')
        const lines = childProcessLines(readFileSync(absPath, 'utf8'))
        if (lines.length > 0 && !isAllowed(rel)) {
          violations.push({ file: rel, lines })
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map((v) => `  ${v.file}:${v.lines.join(',')}`).join('\n')
      throw new Error(
        `Found child_process usage outside the reviewed allowlist:\n${msg}\n\n` +
          `Move runtime agent spawning to @fulcrum/worker, or add a narrow allowlist entry with a reviewer-readable reason.`,
      )
    }
  })

  it('keeps exact allowlist entries live', () => {
    for (const entry of ALLOWED_EXACT) {
      const content = readFileSync(join(REPO_ROOT, entry.path), 'utf8')
      expect(
        childProcessLines(content).length,
        `${entry.path} is allowlisted but no longer imports child_process. Remove its allowlist entry.`,
      ).toBeGreaterThan(0)
    }
  })
})
