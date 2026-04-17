// v2a per-host correctness cluster — integration smoke tests.
//
// Tasks 46-52 modify the on-disk agent-integration/ configs. These tests
// assert the files are shaped correctly without spinning up live agents.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getCockpitStatus, startCockpit, stopCockpit } from '../pi-cockpit.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

// vitest runs from monorepo root by default; fall back to __dirname-based
// resolution when that's not the case.
const here = dirname(fileURLToPath(import.meta.url))
// Walk up from packages/cli/src/tests until we find the monorepo marker.
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, 'agent-integration'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(startDir, '..', '..', '..', '..')
}
const REPO_ROOT = findRepoRoot(here)

describe('Task 46 — skills symlinks', () => {
  const hostsWithSymlinks: [string, string][] = [
    ['claude', 'claude/.agents/skills'],
    ['codex', 'codex/.agents/skills'],
    ['opencode', 'opencode/.agents/skills'],
    ['pi-cockpit', 'pi/cockpit/skills'],
  ]

  for (const [host, relPath] of hostsWithSymlinks) {
    it(`${host}: has a symlink under agent-integration/${relPath}`, () => {
      const abs = join(REPO_ROOT, 'agent-integration', relPath)
      expect(existsSync(abs), `${relPath} does not exist`).toBe(true)
      const stat = lstatSync(abs)
      expect(stat.isSymbolicLink(), `${relPath} is not a symlink`).toBe(true)
      const target = readlinkSync(abs)
      expect(target).toMatch(/\.\.\/.*skills/)
    })
  }

  it('canonical skills tree exists at agent-integration/skills', () => {
    const canonical = join(REPO_ROOT, 'agent-integration', 'skills')
    expect(existsSync(canonical)).toBe(true)
    expect(lstatSync(canonical).isDirectory()).toBe(true)
  })
})

describe('Task 47 — hook matcher narrowing', () => {
  it('Claude: PreToolUse matcher is the mutating tool regex', () => {
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/claude/settings-hooks-snippet.json'), 'utf8')) as Record<string, unknown>
    const hooks = settings['hooks'] as Record<string, Array<Record<string, unknown>>>
    const pre = hooks['PreToolUse']!
    expect(pre[0]!['matcher']).toBe('Write|Edit|MultiEdit|NotebookEdit|Bash|Task')
  })

  it('Claude: PostToolUse matcher is the mutating tool regex', () => {
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/claude/settings-hooks-snippet.json'), 'utf8')) as Record<string, unknown>
    const hooks = settings['hooks'] as Record<string, Array<Record<string, unknown>>>
    const post = hooks['PostToolUse']!
    expect(post[0]!['matcher']).toBe('Write|Edit|MultiEdit|NotebookEdit|Bash|Task')
  })

  it('Gemini: BeforeTool tools array is narrowed', () => {
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/gemini/hooks/hooks.json'), 'utf8')) as Record<string, Array<Record<string, unknown>>>
    const before = hooks['BeforeTool']!
    expect(before[0]!['tools']).toEqual(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Task'])
  })

  it('Codex: config.toml includes allowed_tools on PostToolUse', () => {
    const toml = readFileSync(join(REPO_ROOT, 'agent-integration/codex/config.toml'), 'utf8')
    expect(toml).toContain('allowed_tools = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task"]')
  })

  it('OpenCode: plugin declares FULCRUM_TOOL_ALLOWLIST', () => {
    const plugin = readFileSync(join(REPO_ROOT, 'agent-integration/opencode/plugins/fulcrum.ts'), 'utf8')
    expect(plugin).toContain('FULCRUM_TOOL_ALLOWLIST')
    expect(plugin).toMatch(/Write.*Edit.*MultiEdit.*NotebookEdit.*Bash.*Task/s)
  })
})

describe('Task 48 — run-lifecycle signals', () => {
  it('Claude: SessionEnd + SubagentStart + SubagentStop are registered', () => {
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/claude/settings-hooks-snippet.json'), 'utf8')) as Record<string, unknown>
    const hooks = settings['hooks'] as Record<string, unknown>
    expect(hooks).toHaveProperty('SessionEnd')
    expect(hooks).toHaveProperty('SubagentStart')
    expect(hooks).toHaveProperty('SubagentStop')
  })

  it('Gemini: AfterAgent fires session_summary', () => {
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/gemini/hooks/hooks.json'), 'utf8')) as Record<string, unknown>
    expect(hooks).toHaveProperty('AfterAgent')
  })

  it('Codex: [notify] block exists', () => {
    const toml = readFileSync(join(REPO_ROOT, 'agent-integration/codex/config.toml'), 'utf8')
    expect(toml).toContain('[notify]')
  })

  it('OpenCode: event handler subscribes to session.idle + session.compacted', () => {
    const plugin = readFileSync(join(REPO_ROOT, 'agent-integration/opencode/plugins/fulcrum.ts'), 'utf8')
    expect(plugin).toContain('session.idle')
    expect(plugin).toContain('session.compacted')
  })
})

describe('Task 49 — Codex marketplace path fix', () => {
  it('marketplace.json path is "./plugin", not PLACEHOLDER', () => {
    const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/codex/marketplace.json'), 'utf8')) as { plugins: Array<{ source: { path: string } }> }
    const first = marketplace.plugins[0]!
    expect(first.source.path).toBe('./plugin')
  })
})

describe('Task 51 — Pi cockpit CLI + dead JSON removed', () => {
  it('agent-integration/pi/fulcrum.extension.json is deleted', () => {
    expect(existsSync(join(REPO_ROOT, 'agent-integration/pi/fulcrum.extension.json'))).toBe(false)
  })

  it('getCockpitStatus returns running=false when no cockpit running', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-cockpit-test-'))
    process.env['FULCRUM_DATA_DIR'] = dir
    try {
      const status = getCockpitStatus()
      expect(status.running).toBe(false)
      expect(status.pid).toBe(null)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      delete process.env['FULCRUM_DATA_DIR']
    }
  })

  it('stopCockpit no-ops when nothing running', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-cockpit-test-'))
    process.env['FULCRUM_DATA_DIR'] = dir
    try {
      const result = stopCockpit()
      expect(result.stopped).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      delete process.env['FULCRUM_DATA_DIR']
    }
  })
})

describe('Task 52 — Gemini BeforeAgent stub removed', () => {
  it('BeforeAgent is no longer registered', () => {
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/gemini/hooks/hooks.json'), 'utf8')) as Record<string, unknown>
    expect(hooks).not.toHaveProperty('BeforeAgent')
  })
})
