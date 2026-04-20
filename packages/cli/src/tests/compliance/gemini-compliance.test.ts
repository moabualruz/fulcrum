// Gemini CLI compliance — TDD spec gate for PR 7 expanded scope.
//
// Sources (framework-docs-researcher 2026-04-20; Gemini CLI v0.36.x):
//   docs/hooks/reference.md        — per-event stdin/stdout contract
//   docs/hooks/index.md            — env vars, golden JSON-only rule
//   docs/hooks/writing-hooks.md    — matcher examples
//   docs/extensions/reference.md   — manifest schema, policy rule schema
//   docs/reference/policy-engine.md — tier system (extension tier drops `allow`)
//   docs/core/subagents.md         — subagent isolation + frontmatter
//   docs/cli/plan-mode.md          — plan.directory
//
// Assertions that document the known gaps are marked `// GAP:` + the finding
// id from the research report. When the fix lands, the gap comment stays for
// future drift detection.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  agentDir,
  readText,
  readJsonIfExists,
  parseToml,
  parseFrontmatter,
  listDir,
  runCli,
  parseStdoutJson,
} from './helpers.js'

const G = agentDir('gemini')

describe('Gemini: extension manifest', () => {
  const manifestPath = join(G, 'gemini-extension.json')
  const manifest = readJsonIfExists<Record<string, unknown>>(manifestPath)

  it('manifest exists', () => {
    expect(manifest).not.toBeNull()
  })

  it('declares name, version, description', () => {
    expect(manifest?.name).toBe('fulcrum')
    expect(typeof manifest?.version).toBe('string')
    expect(typeof manifest?.description).toBe('string')
  })

  it('registers mcpServers.fulcrum (stdio)', () => {
    const mcp = manifest?.mcpServers as Record<string, any> | undefined
    expect(mcp?.fulcrum).toBeDefined()
    expect(typeof mcp?.fulcrum.command).toBe('string')
    expect(Array.isArray(mcp?.fulcrum.args)).toBe(true)
  })

  it('GAP(F.8) declares settings[] for FULCRUM_* user config', () => {
    // Research: settings[] is the canonical interactive config surface
    // (docs/extensions/writing-extensions.md §"Add extension settings").
    // Fulcrum should expose FULCRUM_MEMORY_V3, FULCRUM_MONITOR_PORT, etc.
    expect(Array.isArray(manifest?.settings)).toBe(true)
    expect((manifest?.settings as unknown[])?.length ?? 0).toBeGreaterThan(0)
  })

  it('GAP(F.9) declares plan.directory to bind Gemini plan-mode to Fulcrum', () => {
    expect(manifest?.plan).toBeDefined()
    expect(typeof (manifest?.plan as any)?.directory).toBe('string')
  })

  it('scaffolds migratedTo (commented or null) per PR 14.5', () => {
    // Accept either a string, null, or missing with a nearby comment. The raw
    // file read is the source of truth here because JSON strips comments.
    const raw = readText(manifestPath)
    const hasField =
      manifest && Object.prototype.hasOwnProperty.call(manifest, 'migratedTo')
    const hasComment = /migratedTo/.test(raw)
    expect(hasField || hasComment).toBe(true)
  })
})

describe('Gemini: hooks.json contract', () => {
  const hooks = readJsonIfExists<Record<string, Array<any>>>(
    join(G, 'hooks/hooks.json')
  )

  it('hooks.json exists', () => {
    expect(hooks).not.toBeNull()
  })

  it('registers all 11 events', () => {
    const expected = [
      'SessionStart',
      'SessionEnd',
      'BeforeAgent',
      'AfterAgent',
      'BeforeModel',
      'AfterModel',
      'BeforeToolSelection',
      'BeforeTool',
      'AfterTool',
      'PreCompress',
      'Notification',
    ]
    for (const e of expected) {
      expect(hooks).toHaveProperty(e)
    }
  })

  it('GAP(hooks-M1) BeforeTool/AfterTool matchers use Gemini tool names not Claude', () => {
    // Gemini's canonical tool names per docs/cli/built-in-tools.md:
    //   write_file, replace, run_shell_command, read_file, list_directory, ...
    // Claude names (Write|Edit|MultiEdit|Bash|Task) never fire the matcher.
    const bt = hooks?.BeforeTool?.[0]?.matcher as string | undefined
    const at = hooks?.AfterTool?.[0]?.matcher as string | undefined
    const ok = (m: string | undefined) =>
      !!m && /write_file|replace|run_shell_command/.test(m)
    const claudish = (m: string | undefined) =>
      !!m && /\b(Write|Edit|MultiEdit|NotebookEdit|Bash|Task)\b/.test(m)
    expect(ok(bt)).toBe(true)
    expect(ok(at)).toBe(true)
    expect(claudish(bt)).toBe(false)
    expect(claudish(at)).toBe(false)
  })

  it('GAP(hooks-M2) hook entries omit Claude-only `tools: []` field', () => {
    // Gemini hooks.json schema per docs/hooks/reference.md has no `tools`
    // array — matcher regex alone governs routing.
    for (const entries of Object.values(hooks ?? {})) {
      for (const entry of entries) {
        expect((entry as any).tools).toBeUndefined()
      }
    }
  })

  it('GAP(hooks-M3) SessionStart matcher is "startup" (not wildcard) to avoid /clear zombies', () => {
    // SessionStart fires for startup|resume|clear|logout|prompt_input_exit|other.
    // A `*` matcher fires fulcrum start_agent_run on every /clear, creating
    // zombie runs.
    const matcher = hooks?.SessionStart?.[0]?.matcher
    expect(matcher === 'startup' || Array.isArray(matcher)).toBe(true)
  })

  it('every hook entry declares an explicit timeout', () => {
    // Best-practice per docs/hooks/best-practices.md §"Configure Hook Timeout".
    for (const [event, entries] of Object.entries(hooks ?? {})) {
      for (const entry of entries) {
        for (const h of (entry as any).hooks ?? []) {
          expect(typeof h.timeout, `${event} hook missing timeout`).toBe('number')
        }
      }
    }
  })
})

describe('Gemini: policies contract', () => {
  const corePath = join(G, 'policies/fulcrum-core.toml')
  const sensitivePath = join(G, 'policies/fulcrum-sensitive.toml')

  it('GAP(pol-M1) no extension-tier policy emits decision="allow" (silently dropped)', () => {
    // Source: docs/extensions/reference.md §"Policy Engine Rules":
    //   "allow decisions and yolo mode are ignored for security" at the
    //   extension tier. Our fulcrum-core.toml shipping `allow` is dead code.
    // Either drop the file or installer moves it to user tier.
    if (!existsSync(corePath)) return // already dropped — pass
    const doc = parseToml(readText(corePath))
    const rules = (doc.rule as Array<{ decision?: string }> | undefined) ?? []
    for (const r of rules) {
      expect(r.decision).not.toBe('allow')
    }
  })

  it('sensitive policy uses ask_user (honored at extension tier)', () => {
    if (!existsSync(sensitivePath)) return
    const doc = parseToml(readText(sensitivePath))
    const rules =
      (doc.rule as Array<{ decision?: string }> | undefined) ?? []
    for (const r of rules) {
      expect(['ask_user', 'deny']).toContain(r.decision)
    }
  })

  it('GAP(pol-S1) installs a subagent-scoped deny rule for chief_of_staff write tools', () => {
    // Source: docs/core/subagents.md §"Enforce Subagent-Specific Policies":
    //   [[rule]] subagent = "chief_of_staff" toolName = "write_file"
    //   decision = "deny" — the canonical way to enforce role boundaries.
    // Currently we enforce via prompt text only; the engine-level enforcement
    // is absent.
    const files = listDir(join(G, 'policies')).filter((f) =>
      f.endsWith('.toml')
    )
    const found = files.some((f) => {
      const doc = parseToml(readText(f))
      const rules =
        (doc.rule as Array<Record<string, unknown>> | undefined) ?? []
      return rules.some(
        (r) =>
          r.subagent === 'chief_of_staff' &&
          (r.decision === 'deny' || r.decision === 'ask_user')
      )
    })
    expect(found).toBe(true)
  })
})

describe('Gemini: subagent MCP isolation (per docs/core/subagents.md)', () => {
  // Subagents do NOT inherit the extension's mcpServers automatically.
  // Every agent MD that documents fulcrum-MCP tool usage must declare the
  // mcpServers block inline, or the chief_of_staff/etc invocations fail.
  const agentsDir = join(G, 'agents')
  const files = listDir(agentsDir).filter((f) => f.endsWith('.md'))

  it('at least 24 canonical role MDs present', () => {
    expect(files.length).toBeGreaterThanOrEqual(24)
  })

  it('GAP(sub-M1) every role MD declares mcpServers.fulcrum inline', () => {
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm) continue
      const mcp = fm.mcpServers as Record<string, unknown> | undefined
      expect(
        mcp?.fulcrum,
        `${f} missing mcpServers.fulcrum — subagent isolation drops inheritance`
      ).toBeDefined()
    }
  })

  it('role MDs declare kind: local', () => {
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm) continue
      expect(fm.kind).toBe('local')
    }
  })
})

describe('Gemini: GEMINI.md marker block + @imports', () => {
  const path = join(G, 'GEMINI.md')

  it('carries BEGIN/END FULCRUM managed-block v1', () => {
    const raw = readText(path)
    expect(raw).toMatch(/BEGIN FULCRUM managed-block/)
    expect(raw).toMatch(/END FULCRUM managed-block/)
  })

  it('GAP(md-S1) modularizes via @./imports for the 3 canonical rules', () => {
    // docs/cli/gemini-md.md §"Modularize context with imports".
    const raw = readText(path)
    expect(raw).toMatch(/@\.\/rules\//)
  })
})

describe('Gemini: hook handler stdout contract (black-box)', () => {
  // These tests invoke the CLI with synthetic Gemini stdin and assert the
  // stdout JSON matches the docs/hooks/reference.md hookSpecificOutput shape.
  const stdin = (extra: Record<string, unknown>) =>
    JSON.stringify({
      session_id: 'sess-compliance',
      transcript_path: '/tmp/compliance.jsonl',
      cwd: process.cwd(),
      hook_event_name: extra.hook_event_name,
      timestamp: new Date().toISOString(),
      ...extra,
    })

  it('GAP(handler-M1) runGeminiSessionStartHook emits hookEventName=SessionStart', () => {
    const result = runCli(
      ['hook', 'gemini', 'session-start'],
      stdin({ hook_event_name: 'SessionStart', source: 'startup' })
    )
    expect(result.exitCode).toBe(0)
    const out = parseStdoutJson(result.stdout) as any
    expect(out?.hookSpecificOutput?.hookEventName).toBe('SessionStart')
  })

  it('GAP(handler-S1) runGeminiSessionStartHook emits additionalContext with workspace summary', () => {
    // docs/hooks/reference.md §SessionStart: additionalContext is injected
    // as the first turn in history — this is the canonical way to push
    // Fulcrum workspace state into the session prelude.
    const result = runCli(
      ['hook', 'gemini', 'session-start'],
      stdin({ hook_event_name: 'SessionStart', source: 'startup' })
    )
    const out = parseStdoutJson(result.stdout) as any
    expect(typeof out?.hookSpecificOutput?.additionalContext).toBe('string')
    expect(out?.hookSpecificOutput?.additionalContext.length).toBeGreaterThan(0)
  })

  it('GAP(handler-S2) runGeminiBeforeAgentHook emits additionalContext from memory recall', () => {
    const result = runCli(
      ['hook', 'gemini', 'before-agent'],
      stdin({
        hook_event_name: 'BeforeAgent',
        prompt: 'How does the recall pipeline work?',
      })
    )
    const out = parseStdoutJson(result.stdout) as any
    expect(out?.hookSpecificOutput?.hookEventName).toBe('BeforeAgent')
    // memory recall may return empty if no matches; but the field must be
    // present (string, can be empty) when the handler opts-in.
    expect('additionalContext' in (out?.hookSpecificOutput ?? {})).toBe(true)
  })

  it('runGeminiBeforeToolSelectionHook carries hookEventName', () => {
    const result = runCli(
      ['hook', 'gemini', 'before-tool-selection'],
      stdin({
        hook_event_name: 'BeforeToolSelection',
        llm_request: { model: 'gemini-2.5-pro', messages: [], config: {} },
      })
    )
    const out = parseStdoutJson(result.stdout) as any
    expect(out?.hookSpecificOutput?.hookEventName).toBe('BeforeToolSelection')
  })

  it('runGeminiNotificationHook drains + exits 0', () => {
    const result = runCli(
      ['hook', 'gemini', 'notification'],
      stdin({
        hook_event_name: 'Notification',
        notification_type: 'ToolPermission',
        message: 'write_file needs permission',
        details: {},
      })
    )
    expect(result.exitCode).toBe(0)
  })

  it('runGeminiAfterModelHook is deliberately a no-op per AD-4 20ms budget', () => {
    const result = runCli(
      ['hook', 'gemini', 'after-model'],
      stdin({
        hook_event_name: 'AfterModel',
        llm_request: { model: 'gemini-2.5-pro', messages: [], config: {} },
        llm_response: { content: 'chunk', role: 'assistant' },
      })
    )
    expect(result.exitCode).toBe(0)
    // AfterModel fires per streaming chunk; must not write DB rows.
    expect(result.stdout.trim()).toBe('')
  })
})

describe('Gemini: extractRecallQuery uses correct tool-input keys', () => {
  it('GAP(extract-S1) list_directory and read_file use `absolute_path` not `path`', async () => {
    // Research: Gemini's list_directory/read_file both use absolute_path key.
    // Our hooks.ts:113-119 read toolInput["path"] which is always undefined.
    const mod = await import('../../hooks.js')
    const fn = (mod as any).extractRecallQuery as
      | ((toolName: string, toolInput: unknown) => string)
      | undefined
    if (!fn) {
      // If the helper is not exported, the test records the gap by failing.
      expect.fail('extractRecallQuery must be exported for compliance testing')
    }
    expect(fn!('list_directory', { absolute_path: '/tmp/foo' })).toContain('foo')
    expect(fn!('read_file', { absolute_path: '/tmp/bar.txt' })).toContain('bar')
  })
})

describe('Gemini: detectHookCli routes correctly on session_id+tool_name shape', () => {
  it('GAP(detect-M1) an event with snake_case `session_id` + `tool_name` must not be mis-routed to claude', async () => {
    // Gemini base stdin adopted snake_case `session_id` (docs/hooks/reference.md).
    // Our detectHookCli ordering matches claude first, so a Gemini BeforeTool
    // event is detected as claude and normalization drops Gemini-only fallbacks.
    const mod = await import('../../hooks.js')
    const fn = (mod as any).detectHookCli as
      | ((evt: Record<string, unknown>) => string)
      | undefined
    if (!fn) {
      expect.fail('detectHookCli must be exported for compliance testing')
    }
    // With no hook_event_name, the only differentiator is the CLI flag at
    // invocation. But when hook_event_name IS present, it's unambiguously
    // gemini.
    const evt = {
      session_id: 'sess-1',
      tool_name: 'write_file',
      hook_event_name: 'BeforeTool',
    }
    expect(fn!(evt)).toBe('gemini')
  })
})
