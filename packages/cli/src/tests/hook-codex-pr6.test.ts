// PR 6 — Codex deep integration hook handlers.
// Covers: runCodexUserPromptSubmitHook (6.1), runCodexPermissionRequestHook (6.2).
// Each must: (a) never throw, (b) emit the correct Codex response JSON on stdout,
// (c) write a hook_events row when applicable, (d) load the canonical rider
// from FULCRUM_RULES_DIR and project it into additional_context.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'

let tmpDir: string | null = null
let rulesDir: string | null = null
const originalFulcrumDir = process.env.FULCRUM_DATA_DIR
const originalWorkspaceId = process.env.FULCRUM_WORKSPACE_ID
const originalProjectId = process.env.FULCRUM_PROJECT_ID
const originalRulesDir = process.env.FULCRUM_RULES_DIR
const originalHome = process.env.HOME

function setupTmpDb(): void {
  closeDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-codex-pr6-'))
  process.env.FULCRUM_DATA_DIR = tmpDir
  process.env.FULCRUM_WORKSPACE_ID = 'ws_pr6'
  process.env.FULCRUM_PROJECT_ID = 'proj_pr6'
  const db = getDb(tmpDir)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_pr6', 'pr6')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name) VALUES ('proj_pr6', 'ws_pr6', 'pr6')`).run()
}

function setupRulesDir(rules: Array<{ name: string; body: string }>): void {
  rulesDir = join(tmpDir!, 'rules')
  mkdirSync(rulesDir, { recursive: true })
  for (const r of rules) {
    writeFileSync(join(rulesDir, `${r.name}.md`), r.body, 'utf8')
  }
  process.env.FULCRUM_RULES_DIR = rulesDir
}

function seedTrustedCodexSession(sessionId: string, runId: string): void {
  const db = getDb()
  db.prepare(`INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title) VALUES ('task_codex_bias', 'ws_pr6', 'proj_pr6', 'codex bias task')`).run()
  db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, role) VALUES (?, 'task_codex_bias', 'ws_pr6', 'software_engineer')`).run(runId)
  mkdirSync(join(tmpDir!, 'sessions'), { recursive: true })
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
  writeFileSync(join(tmpDir!, 'sessions', `${safeSessionId}.json`), JSON.stringify({
    session_id: sessionId,
    run_id: runId,
    workspace_id: 'ws_pr6',
    project_id: 'proj_pr6',
  }))
}

function readRecallTelemetry(): Array<Record<string, unknown>> {
  const path = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

function tearDownTmpDb(): void {
  closeDb()
  if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ } tmpDir = null }
  rulesDir = null
  for (const [k, v] of [
    ['FULCRUM_DATA_DIR', originalFulcrumDir],
    ['FULCRUM_WORKSPACE_ID', originalWorkspaceId],
    ['FULCRUM_PROJECT_ID', originalProjectId],
    ['FULCRUM_RULES_DIR', originalRulesDir],
    ['HOME', originalHome],
  ] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

async function runHookWithStdin(hookFn: () => Promise<void>, stdin: string): Promise<{ stdout: string; stderr: string; exit: number | null }> {
  const captured = { stdout: '', stderr: '', exit: null as number | null }
  const origStdinOn = process.stdin.on.bind(process.stdin)
  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  const origExit = process.exit.bind(process)

  process.stdin.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'data' && stdin) {
      queueMicrotask(() => handler(Buffer.from(stdin)))
    } else if (event === 'end') {
      queueMicrotask(() => handler())
    }
    return process.stdin
  }) as typeof process.stdin.on
  process.stdout.write = ((chunk: string | Uint8Array) => { captured.stdout += typeof chunk === 'string' ? chunk : chunk.toString(); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { captured.stderr += typeof chunk === 'string' ? chunk : chunk.toString(); return true }) as typeof process.stderr.write
  process.exit = ((code?: number) => { captured.exit = code ?? 0; throw new Error('__exit__') }) as typeof process.exit

  try {
    await hookFn()
  } catch (err) {
    if (!(err instanceof Error) || err.message !== '__exit__') throw err
  } finally {
    process.stdin.on = origStdinOn
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exit = origExit
  }
  return captured
}

describe('PR 6.1 runCodexUserPromptSubmitHook', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('injects canonical rider as additional_context in Codex snake_case response', async () => {
    setupRulesDir([
      { name: 'fulcrum-first', body: '# Fulcrum-First Bias\n\nRecall before Write/Edit.' },
      { name: 'lifecycle', body: '# Lifecycle\n\nCall start_agent_run at task start.' },
      { name: 'role-boundaries', body: '# Role Boundaries\n\nL1 orchestrates; L2 implements.' },
    ])
    const { runCodexUserPromptSubmitHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexUserPromptSubmitHook, JSON.stringify({
      session_id: 'codex-sess-rider',
      prompt: 'plan the next PR',
    }))
    expect(out.exit).toBe(0)
    const resp = JSON.parse(out.stdout) as {
      hook_specific_output?: { hook_event_name?: string; additional_context?: string }
    }
    expect(resp.hook_specific_output?.hook_event_name).toBe('UserPromptSubmit')
    const ctx = resp.hook_specific_output?.additional_context ?? ''
    expect(ctx).toContain('Fulcrum-First Bias')
    expect(ctx).toContain('Lifecycle')
    expect(ctx).toContain('Role Boundaries')
    // Rules join with ---  separator to match opencode loadRider byte-for-byte.
    expect(ctx).toContain('\n\n---\n\n')
  })

  it('writes a hook_events row tagged cli_name=codex', async () => {
    setupRulesDir([{ name: 'r', body: '# rule body' }])
    const { runCodexUserPromptSubmitHook } = await import('../index.js')
    await runHookWithStdin(runCodexUserPromptSubmitHook, JSON.stringify({
      session_id: 'codex-sess-event',
      prompt: 'hi',
    }))
    const db = getDb()
    const row = db.prepare(`SELECT tool_name, cli_name FROM hook_events WHERE session_id = ?`).get('codex-sess-event') as { tool_name: string; cli_name: string } | undefined
    expect(row?.tool_name).toBe('UserPromptSubmit')
    expect(row?.cli_name).toBe('codex')
  })

  it('records UserPromptSubmit as turn_observed, not recall_called', async () => {
    setupRulesDir([{ name: 'r', body: '# rule body' }])
    const { runCodexUserPromptSubmitHook } = await import('../index.js')
    await runHookWithStdin(runCodexUserPromptSubmitHook, JSON.stringify({
      session_id: 'codex-sess-turn-observed',
      prompt: 'hi',
    }))
    const kinds = readRecallTelemetry().map((e) => e.kind)
    expect(kinds).toContain('turn_observed')
    expect(kinds).not.toContain('recall_called')
  })

  it('falls back to installed rules when FULCRUM_RULES_DIR points to a missing dir', async () => {
    process.env.FULCRUM_RULES_DIR = join(tmpDir!, 'does-not-exist')
    process.env.HOME = tmpDir!
    const installedRulesDir = join(tmpDir!, '.codex', 'rules')
    mkdirSync(installedRulesDir, { recursive: true })
    writeFileSync(join(installedRulesDir, 'installed.md'), '# Installed Rider\n\nLoaded from ~/.codex/rules.', 'utf8')
    const { runCodexUserPromptSubmitHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexUserPromptSubmitHook, JSON.stringify({
      session_id: 'codex-sess-nodir',
      prompt: 'p',
    }))
    expect(out.exit).toBe(0)
    const resp = JSON.parse(out.stdout) as { hook_specific_output?: { additional_context?: string } }
    const ctx = resp.hook_specific_output?.additional_context ?? ''
    expect(ctx).toContain('Installed Rider')
    expect(ctx).toContain('Loaded from ~/.codex/rules')
  })

  it('handles empty stdin without crashing', async () => {
    setupRulesDir([{ name: 'r', body: '# body' }])
    const { runCodexUserPromptSubmitHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexUserPromptSubmitHook, '')
    expect(out.exit).toBe(0)
    // Even with empty stdin, rider should still be emitted when env is set.
    if (out.stdout) {
      const resp = JSON.parse(out.stdout) as { hook_specific_output?: { additional_context?: string } }
      expect(resp.hook_specific_output?.additional_context ?? '').toContain('body')
    }
  })

  it('CLI dispatch wires `fulcrum hook codex user-prompt-submit` → runCodexUserPromptSubmitHook', async () => {
    // Source-level check: the dispatch map in runHook routes the phase.
    const src = await import('fs').then(m => m.readFileSync(
      join(import.meta.dirname ?? __dirname, '..', 'index.ts'), 'utf8'))
    expect(src).toMatch(/phaseArg === ['"]user-prompt-submit['"]\s*\)\s*\{\s*await runCodexUserPromptSubmitHook/)
  })
})

describe('PR 6.2 runCodexPermissionRequestHook', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => {
    tearDownTmpDb()
    delete process.env.FULCRUM_SECRET_SCAN
  })

  it('allow-path: emits nothing on stdout (fall-through) + exit 0 for read tools', async () => {
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, JSON.stringify({
      session_id: 'codex-perm-allow',
      turn_id: 'turn-1',
      cwd: '/tmp',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Read',
      tool_input: { command: '', description: 'read a file' },
    }))
    expect(out.exit).toBe(0)
    // Allow = no hook verdict → empty stdout; Codex falls through to normal approval UI.
    expect(out.stdout).toBe('')
  })

  it('deny-path: secret in tool_input → hookSpecificOutput decision behavior:"deny" + message', async () => {
    process.env.FULCRUM_SECRET_SCAN = '1'
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, JSON.stringify({
      session_id: 'codex-perm-deny',
      turn_id: 'turn-1',
      cwd: '/tmp',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Write',
      tool_input: {
        command: '',
        description: 'write a config file with AKIA1234567890ABCDEF AWS key',
      },
    }))
    expect(out.exit).toBe(2)
    const resp = JSON.parse(out.stdout) as {
      hookSpecificOutput?: {
        hookEventName?: string
        decision?: { behavior?: string; message?: string }
      }
    }
    expect(resp.hookSpecificOutput?.hookEventName).toBe('PermissionRequest')
    expect(resp.hookSpecificOutput?.decision?.behavior).toBe('deny')
    expect(resp.hookSpecificOutput?.decision?.message ?? '').toMatch(/secret|credential/i)
  })

  it('deny-path: non-chief invoke_team → deny with policy reason', async () => {
    const db = getDb()
    db.prepare(`INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title) VALUES ('t', 'ws_pr6', 'proj_pr6', 't')`).run()
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, role) VALUES ('run-perm-1', 't', 'ws_pr6', 'software_engineer')`).run()
    mkdirSync(join(tmpDir!, 'sessions'), { recursive: true })
    writeFileSync(join(tmpDir!, 'sessions', 'codex-perm-team.json'), JSON.stringify({
      session_id: 'codex-perm-team', run_id: 'run-perm-1', workspace_id: 'ws_pr6',
    }))
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, JSON.stringify({
      session_id: 'codex-perm-team',
      turn_id: 'turn-1',
      cwd: '/tmp',
      hook_event_name: 'PermissionRequest',
      tool_name: 'mcp__fulcrum__invoke_team',
      tool_input: { command: '', description: 'invoke a team' },
    }))
    expect(out.exit).toBe(2)
    const resp = JSON.parse(out.stdout) as {
      hookSpecificOutput?: { decision?: { behavior?: string; message?: string } }
    }
    expect(resp.hookSpecificOutput?.decision?.behavior).toBe('deny')
    expect(resp.hookSpecificOutput?.decision?.message ?? '').toMatch(/invoke_team|chief_of_staff/i)
  })

  it('nudge-path: Codex search PermissionRequest emits Fulcrum-first telemetry without blocking', async () => {
    seedTrustedCodexSession('codex-perm-search', 'run_codex_search')
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, JSON.stringify({
      session_id: 'codex-perm-search',
      turn_id: 'turn-search',
      cwd: '/tmp',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Grep',
      tool_input: { pattern: 'workspace policy' },
    }))
    expect(out.exit).toBe(0)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('fulcrum-first')
    expect(out.stderr).toContain('Codex requested Grep')
    const events = readRecallTelemetry()
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('grep_called_without_recall')
    expect(kinds).toContain('nudge_emitted')
    const grep = events.find((e) => e.kind === 'grep_called_without_recall')
    expect(grep?.agent_type).toBe('codex')
    expect(grep?.turn_id).toBe('turn-search')
  })

  it('recall-path: Codex recall PermissionRequest records recall without nudge', async () => {
    seedTrustedCodexSession('codex-perm-recall', 'run_codex_recall')
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, JSON.stringify({
      session_id: 'codex-perm-recall',
      turn_id: 'turn-recall',
      cwd: '/tmp',
      hook_event_name: 'PermissionRequest',
      tool_name: 'mcp__fulcrum__recall_memory',
      tool_input: { query: 'workspace policy' },
    }))
    expect(out.exit).toBe(0)
    expect(out.stdout).toBe('')
    expect(out.stderr).not.toContain('fulcrum-first')
    const events = readRecallTelemetry()
    expect(events.map((e) => e.kind)).toContain('recall_called')
    expect(events.map((e) => e.kind)).not.toContain('nudge_emitted')
  })

  it('handles empty stdin without crashing', async () => {
    const { runCodexPermissionRequestHook } = await import('../index.js')
    const out = await runHookWithStdin(runCodexPermissionRequestHook, '')
    expect(out.exit).toBe(0)
  })

  it('CLI dispatch wires `fulcrum hook codex permission-request` → runCodexPermissionRequestHook', async () => {
    const src = await import('fs').then(m => m.readFileSync(
      join(import.meta.dirname ?? __dirname, '..', 'index.ts'), 'utf8'))
    expect(src).toMatch(/phaseArg === ['"]permission-request['"]\s*\)\s*\{\s*await runCodexPermissionRequestHook/)
  })
})

describe('PR 6.8 Codex app-server JSON-RPC — stable surface only', () => {
  it('buildMcpReloadRequest produces `config/mcpServer/reload` JSON-RPC with caller-supplied id', async () => {
    const { buildMcpReloadRequest } = await import('../codex-app-server.js')
    const req = buildMcpReloadRequest(7)
    expect(req.method).toBe('config/mcpServer/reload')
    expect(req.id).toBe(7)
    expect(req.jsonrpc).toBe('2.0')
    // Per README: request accepts no params and returns `{}` on success.
    expect(req.params).toBeUndefined()
  })

  it('buildSkillsListRequest produces `skills/list` JSON-RPC with cwds param', async () => {
    const { buildSkillsListRequest } = await import('../codex-app-server.js')
    const req = buildSkillsListRequest(12, { cwds: ['/Users/me/project'], forceReload: true })
    expect(req.method).toBe('skills/list')
    expect(req.id).toBe(12)
    const params = req.params as { cwds?: string[]; forceReload?: boolean }
    expect(params?.cwds).toEqual(['/Users/me/project'])
    expect(params?.forceReload).toBe(true)
  })

  // Guard: the plan explicitly forbids calling the four unstable plugin RPCs
  // (plugin/{list,read,install,uninstall}). They are marked "under development;
  // do not call from production clients yet" in the Codex app-server README.
  it('source code contains NO call sites for unstable plugin/* RPCs', async () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const srcDir = path.resolve(import.meta.dirname ?? __dirname, '..')
    const files = fs.readdirSync(srcDir).filter((n) => n.endsWith('.ts'))
    const unstableMethods = ['"plugin/list"', "'plugin/list'", '"plugin/read"', "'plugin/read'", '"plugin/install"', "'plugin/install'", '"plugin/uninstall"', "'plugin/uninstall'"]
    for (const f of files) {
      const body = fs.readFileSync(path.join(srcDir, f), 'utf8')
      for (const needle of unstableMethods) {
        expect(body.includes(needle), `${f} must not reference unstable RPC ${needle}`).toBe(false)
      }
    }
  })
})

describe('PR 6.7 Shared .claude-plugin/marketplace.json serves both Claude and Codex', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
  const marketPath = path.join(repoRoot, '.claude-plugin', 'marketplace.json')

  it('lists a Codex plugin entry alongside the Claude plugin entry', () => {
    const m = JSON.parse(fs.readFileSync(marketPath, 'utf8')) as { plugins?: Array<Record<string, unknown>> }
    expect(Array.isArray(m.plugins)).toBe(true)
    const plugins = m.plugins ?? []
    // Plugins differentiate by `source:` path per plan 6.7. Both must be present.
    const claude = plugins.find(p => (p.source as string) === './agent-integration/claude')
    const codex = plugins.find(p => (p.source as string) === './agent-integration/codex/plugin')
    expect(claude).toBeDefined()
    expect(codex).toBeDefined()
  })

  it('Codex plugin entry has Codex-loader-required fields (name, source, category, policy)', () => {
    const m = JSON.parse(fs.readFileSync(marketPath, 'utf8')) as { plugins?: Array<Record<string, unknown>> }
    const codex = (m.plugins ?? []).find(p => (p.source as string) === './agent-integration/codex/plugin')!
    expect(codex.name).toBe('fulcrum')
    // Codex marketplace loader reads category + policy.installation; other fields ignored.
    expect(typeof codex.category).toBe('string')
    const policy = codex.policy as Record<string, unknown> | undefined
    expect(policy).toBeDefined()
    expect(['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE']).toContain(policy!.installation)
  })

  it('Codex plugin source path resolves to the real .codex-plugin manifest directory', () => {
    const m = JSON.parse(fs.readFileSync(marketPath, 'utf8')) as { plugins?: Array<Record<string, unknown>> }
    const codex = (m.plugins ?? []).find(p => (p.source as string) === './agent-integration/codex/plugin')!
    // Codex marketplace loader resolves local plugin paths relative to the
    // marketplace ROOT (parent of .claude-plugin/ or .agents/plugins/), not
    // the directory marketplace.json lives in (codex-rs/core-plugins/src/marketplace.rs
    // `marketplace_root_dir`).
    const marketplaceRoot = path.dirname(path.dirname(marketPath))
    const pluginRoot = path.resolve(marketplaceRoot, codex.source as string)
    expect(fs.existsSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'))).toBe(true)
  })
})

describe('PR 6.6 Codex plugin manifest (.codex-plugin/plugin.json)', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
  const manifestPath = path.join(repoRoot, 'agent-integration', 'codex', 'plugin', '.codex-plugin', 'plugin.json')

  it('parses as JSON', () => {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('declares canonical plugin paths (skills, mcpServers) that resolve to real files', () => {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    expect(typeof m.name).toBe('string')
    expect(m.name).toBe('fulcrum')
    expect(typeof m.version).toBe('string')
    expect(typeof m.skills).toBe('string')
    expect(typeof m.mcpServers).toBe('string')
    const pluginRoot = path.dirname(path.dirname(manifestPath))
    expect(fs.existsSync(path.join(pluginRoot, m.skills as string))).toBe(true)
    expect(fs.existsSync(path.join(pluginRoot, m.mcpServers as string))).toBe(true)
  })

  it('interface block carries the full production-quality metadata (PR 6.6 + PR 7 unit 7.27)', () => {
    // PR 7 unit 7.27 (2026-04-20): capabilities normalized from invented
    // underscore-case labels to upstream-recognized capitalized verbs per
    // codex-rs/core-plugins/src/marketplace_tests.rs. Category also moved
    // from lowercase to Title case.
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { interface?: Record<string, unknown> }
    const i = m.interface ?? {}
    expect(i.displayName).toBe('Fulcrum Agent OS')
    expect(typeof i.shortDescription).toBe('string')
    expect(typeof i.longDescription).toBe('string')
    expect(typeof i.developerName).toBe('string')
    expect(i.category).toBe('Productivity')
    expect(Array.isArray(i.capabilities)).toBe(true)
    const caps = i.capabilities as string[]
    // Upstream convention is capitalized single-word labels. Fulcrum ships
    // Interactive + Memory + Orchestration + PolicyEnforcement.
    for (const c of caps) {
      expect(/^[A-Z][a-zA-Z]*$/.test(c), `capability "${c}" should be capitalized`).toBe(true)
    }
    expect(caps.length).toBeGreaterThanOrEqual(3)
    expect(i.brandColor).toBe('#4F46E5')
    expect(typeof i.websiteURL).toBe('string')
    expect(Array.isArray(i.defaultPrompt)).toBe(true)
    expect((i.defaultPrompt as string[]).length).toBeGreaterThan(0)
  })
})

describe('PR 6.3 Codex hook handler types', () => {
  // Guard: Codex's `handler_type = "prompt"` and `"agent"` are declared in the
  // protocol enum but wired as empty-struct no-ops in the hook engine config
  // parser (codex-rs/hooks/src/engine/config.rs) + dispatcher hardcodes
  // HookHandlerType::Command in every HookRunSummary. Wiring `type = "prompt"`
  // today silently creates a no-op hook. This test fails if anyone adds one to
  // the installer or the config.toml template without re-verifying upstream.
  // When upstream adds concrete fields + execution paths, remove this guard.

  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..', '..')

  it('agent-integration/codex/config.toml never sets handler_type = "prompt" | "agent"', () => {
    const configToml = fs.readFileSync(path.join(repoRoot, 'agent-integration', 'codex', 'config.toml'), 'utf8')
    // Allow documentation / comment lines mentioning the keyword; only fail on
    // a non-commented assignment (outside of comment explaining the keyword
    // itself, which is exactly the line we added).
    const lines = configToml.split('\n')
    for (const line of lines) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('#')) continue
      if (/handler_type\s*=\s*"(prompt|agent)"/.test(line)) {
        throw new Error(`Non-commented handler_type = "prompt"|"agent" in config.toml: ${line}`)
      }
    }
  })

  it('agent-integration/install.ts never emits handler_type = "prompt" | "agent" into Codex config', () => {
    const installSrc = fs.readFileSync(path.join(repoRoot, 'agent-integration', 'install.ts'), 'utf8')
    // Installer-emitted TOML content lives in string literals; fail if any
    // literal string contains handler_type = "prompt" or "agent".
    expect(installSrc).not.toMatch(/handler_type\s*=\s*"prompt"/)
    expect(installSrc).not.toMatch(/handler_type\s*=\s*"agent"/)
  })
})
