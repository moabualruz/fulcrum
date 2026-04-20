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

  it('Gemini: BeforeTool matcher uses Gemini-native tool names (PR 7 unit 7.1)', () => {
    // Per docs/hooks/reference.md, Gemini matches tool events by regex against
    // Gemini tool names (write_file, replace, run_shell_command, …). Claude
    // tool names never fire. The Claude-only `tools: []` field is not part of
    // the Gemini hooks schema and must not appear.
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/gemini/hooks/hooks.json'), 'utf8')) as Record<string, Array<Record<string, unknown>>>
    const before = hooks['BeforeTool']!
    expect(before[0]!['matcher']).toMatch(/write_file|replace|run_shell_command/)
    expect(before[0]!['tools']).toBeUndefined()
  })

  it('Codex: hooks.json PostToolUse matcher narrows to mutating tools (PR 7 unit 7.25)', () => {
    // Corrected 2026-04-20: Codex loads hooks from hooks.json (JSON) per
    // codex-rs/hooks/src/engine/discovery.rs. The prior config.toml
    // `[[hooks]]` blocks + `allowed_tools` array were dead code.
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/codex/hooks.json'), 'utf8')) as { hooks: Record<string, Array<{ matcher?: string }>> }
    const post = hooks.hooks['PostToolUse']!
    expect(post[0]!.matcher).toBe('Write|Edit|MultiEdit|NotebookEdit|Bash|Task')
  })

  it('OpenCode: plugin declares FULCRUM_TOOL_ALLOWLIST', () => {
    const plugin = readFileSync(join(REPO_ROOT, 'agent-integration/opencode/plugins/fulcrum.ts'), 'utf8')
    expect(plugin).toContain('FULCRUM_TOOL_ALLOWLIST')
    expect(plugin).toMatch(/Write.*Edit.*MultiEdit.*NotebookEdit.*Bash.*Task/s)
  })
})

describe('Task 48 — run-lifecycle signals', () => {
  it('Claude: SessionEnd + SubagentStop are registered (PR 7 unit 7.20)', () => {
    // Corrected 2026-04-20: SubagentStart is NOT a valid Claude Code event
    // (only SubagentStop exists). The prior test encoded a wrong spec; the
    // event was silently dropped at registration.
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/claude/settings-hooks-snippet.json'), 'utf8')) as Record<string, unknown>
    const hooks = settings['hooks'] as Record<string, unknown>
    expect(hooks).toHaveProperty('SessionEnd')
    expect(hooks).toHaveProperty('SubagentStop')
    // SubagentStart should NOT be registered — it does not exist.
    expect(hooks).not.toHaveProperty('SubagentStart')
  })

  it('Gemini: AfterAgent fires session_summary', () => {
    const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'agent-integration/gemini/hooks/hooks.json'), 'utf8')) as Record<string, unknown>
    expect(hooks).toHaveProperty('AfterAgent')
  })

  it('Codex: notify is a root-level string array (PR 7 unit 7.26)', () => {
    // Corrected 2026-04-20: config_toml.rs defines
    // `pub notify: Option<Vec<String>>` — `notify` is a flat string array
    // at root, NOT a `[notify] command = "..."` table.
    const toml = readFileSync(join(REPO_ROOT, 'agent-integration/codex/config.toml'), 'utf8')
    expect(toml).toMatch(/^notify\s*=\s*\[/m)
    expect(toml).not.toMatch(/^\[notify\]/m)
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

