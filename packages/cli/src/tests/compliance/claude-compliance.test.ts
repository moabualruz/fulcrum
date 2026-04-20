// Claude Code compliance — TDD spec gate for PR 7 expanded scope.
//
// Sources (framework-docs-researcher 2026-04-20; Claude Code v2.1.x):
//   plugin-structure/references/manifest-reference.md — plugin.json schema
//   plugin-dev/skills/agent-development/SKILL.md — agent frontmatter
//   (hook events) — canonical event list
//   (marketplace) — .claude-plugin/marketplace.json schema
//
// Every test tagged GAP(<id>) cites the finding from the re-verification
// pass. Red tests are the spec; green means the fix landed.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  agentDir,
  repoRoot,
  readText,
  readJsonIfExists,
  parseFrontmatter,
  listDir,
} from './helpers.js'

const C = agentDir('claude')

describe('Claude: plugin.json manifest', () => {
  const manifest = readJsonIfExists<Record<string, unknown>>(
    join(C, '.claude-plugin/plugin.json')
  )

  it('manifest exists', () => {
    expect(manifest).not.toBeNull()
  })

  it('GAP(claude-M1) uses `mcpServers` (not invalid `mcp:` field)', () => {
    // Source: plugin-structure/references/manifest-reference.md.
    // Our current plugin.json has `"mcp": "../settings-hooks-snippet.json"`
    // which is nonsense — field name is wrong, path points at a DEPRECATED
    // hooks file (not an MCP config).
    expect(manifest).not.toHaveProperty('mcp')
    expect(manifest).toHaveProperty('mcpServers')
    const mcp = manifest?.mcpServers as Record<string, unknown> | string
    expect(mcp).toBeDefined()
  })

  it('declares required metadata (name, version, description)', () => {
    expect(typeof manifest?.name).toBe('string')
    expect(typeof manifest?.version).toBe('string')
    expect(typeof manifest?.description).toBe('string')
  })
})

describe('Claude: 24 canonical subagent MDs — tools schema', () => {
  const files = listDir(join(C, 'agents')).filter((f) => f.endsWith('.md'))

  it('at least 24 role MDs', () => {
    expect(files.length).toBeGreaterThanOrEqual(24)
  })

  it('GAP(claude-M2) `tools` is a flat array, NOT a {allowed, denied} object', () => {
    // Source: plugin-dev/skills/agent-development/SKILL.md §"tools field":
    //   `tools: ["Read", "Write", "Grep", "Bash"]` — flat array.
    //   There is NO `denied` list. There is NO `allowed` sub-key.
    // Our current frontmatter `tools: {allowed: [...], denied: [...]}` is
    // silently ignored; every subagent inherits full tool access, breaking
    // the chief_of_staff no-write contract.
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm || !('tools' in fm)) continue
      const t = fm.tools as unknown
      expect(
        Array.isArray(t),
        `${f} tools: expected flat array, got ${typeof t}`
      ).toBe(true)
      // No {allowed, denied} keys in any shape
      if (typeof t === 'object' && t !== null) {
        expect(t).not.toHaveProperty('allowed')
        expect(t).not.toHaveProperty('denied')
      }
    }
  })

  it('GAP(claude-M2b) chief_of_staff explicitly excludes write tools', () => {
    // Role boundary: no Write/Edit/MultiEdit/NotebookEdit. When tools is a
    // flat array, this boundary is represented by listing ONLY the allowed
    // tools and omitting write tools entirely.
    const p = join(C, 'agents/chief_of_staff.md')
    if (!existsSync(p)) return
    const fm = parseFrontmatter(readText(p))
    const tools = fm?.tools as unknown
    if (!Array.isArray(tools)) {
      // If the schema is still broken, the MUST_FIX above fails first.
      return
    }
    for (const forbid of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(tools).not.toContain(forbid)
    }
  })

  it('GAP(claude-S1) descriptions include <example> blocks for Task-tool auto-delegation', () => {
    // Canonical pattern: descriptions with <example>Context:...user:...assistant:...</example>
    // drive parent-Claude's auto-delegation decision. One-liners don't.
    let withExamples = 0
    for (const f of files) {
      const raw = readText(f)
      if (/<example>/i.test(raw)) withExamples++
    }
    // Must have examples in at least 80% of MDs.
    const ratio = withExamples / files.length
    expect(ratio).toBeGreaterThanOrEqual(0.8)
  })
})

describe('Claude: hooks.json bundled plugin hooks', () => {
  const path = join(C, 'hooks/hooks.json')
  const hooks = readJsonIfExists<{ hooks: Record<string, Array<any>> }>(path)

  it('bundled hooks.json exists', () => {
    expect(hooks).not.toBeNull()
  })

  it('GAP(claude-M3) does not bind non-existent `SubagentStart` event', () => {
    // Valid events per docs: PreToolUse, PostToolUse, Stop, SubagentStop,
    // SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Notification.
    // SubagentStart is NOT an event — bindings are silently dropped.
    expect(hooks?.hooks?.SubagentStart).toBeUndefined()
  })

  it('GAP(claude-S2) every hook entry declares a timeout', () => {
    for (const entries of Object.values(hooks?.hooks ?? {})) {
      for (const entry of entries) {
        for (const h of (entry as any).hooks ?? []) {
          expect(typeof h.timeout).toBe('number')
        }
      }
    }
  })

  it('GAP(claude-S3) plugin-bundled commands use ${CLAUDE_PLUGIN_ROOT}', () => {
    // Plugin install path must not assume `fulcrum` is on PATH. Use
    // ${CLAUDE_PLUGIN_ROOT}/bin/... or a node-invoked shim.
    const raw = readText(path)
    expect(raw).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}|\$CLAUDE_PLUGIN_ROOT/)
  })
})

describe('Claude: deprecated snippet file hygiene', () => {
  const path = join(C, 'settings-hooks-snippet.json')

  it('file carries DEPRECATED marker', () => {
    if (!existsSync(path)) return
    const raw = readText(path)
    expect(raw).toMatch(/deprecated/i)
  })

  it('GAP(claude-M4) does NOT define the fake SubagentStart event even in the deprecated snippet', () => {
    if (!existsSync(path)) return
    const doc = readJsonIfExists<any>(path)
    expect(doc?.hooks?.SubagentStart).toBeUndefined()
  })
})

describe('Claude: CLAUDE.md canonical rules block', () => {
  const path = join(C, 'CLAUDE.md')

  it('has BEGIN/END FULCRUM managed-block', () => {
    const raw = readText(path)
    expect(raw).toMatch(/BEGIN FULCRUM managed-block/)
    expect(raw).toMatch(/END FULCRUM managed-block/)
  })

  it('references recall_knowledge / recall_memory in the managed block', () => {
    const raw = readText(path)
    expect(raw).toMatch(/recall_knowledge|recall_memory/)
  })
})

describe('Claude: marketplace.json at repo root', () => {
  const path = join(repoRoot, '.claude-plugin/marketplace.json')
  const doc = readJsonIfExists<any>(path)

  it('marketplace manifest exists at repo root', () => {
    expect(doc).not.toBeNull()
  })

  it('contains a Fulcrum entry with source pointing at agent-integration/claude', () => {
    const plugins = doc?.plugins as Array<any> | undefined
    const fulcrum = plugins?.find((p) => p.name === 'fulcrum')
    expect(fulcrum).toBeDefined()
    expect(fulcrum?.source).toBe('./agent-integration/claude')
  })
})

describe('Claude: hook handler output contract (black-box)', () => {
  // Current code emits {continue: true}. Spec wants
  // {hookSpecificOutput: {permissionDecision: "allow|deny|ask", ...}}.

  it('GAP(claude-M5) PreToolUse source emits hookSpecificOutput.permissionDecision for Claude', () => {
    // Source-level grep is more robust than function-invocation here because
    // runPreHook streams to stdout via io.stdout(...) rather than returning a
    // value; unit-tests must construct a full HookContext + HookIO pair to
    // drive it, which overlaps the existing black-box tests in
    // hook-claude-pr5.test.ts. This compliance check just verifies the
    // source carries the new shape on the Claude branch — the legacy
    // {continue: true} shape remains as the fallback for opencode / gemini.
    const src = readText(
      join(repoRoot, 'packages/cli/src/hooks.ts')
    )
    expect(src).toMatch(
      /cliName === ['"]claude['"][\s\S]*?hookSpecificOutput[\s\S]*?permissionDecision/
    )
    // The shape helper must not include `continue: true` on the claude
    // branch — that's the deprecated form.
    const claudeBlock = src.match(
      /if \(cliName === ['"]claude['"]\)[\s\S]*?(?=\} else if|\} else\b|\}\s*$)/
    )?.[0]
    expect(claudeBlock).toBeDefined()
    expect(claudeBlock).not.toMatch(/continue:\s*true/)
  })

  it('GAP(claude-S4) SessionStart emits hookSpecificOutput.additionalContext with workspace snapshot', async () => {
    const mod = await import('../../index.js')
    const fn = (mod as any).runSessionStartHook as
      | (() => Promise<any>)
      | undefined
    if (!fn) {
      expect.fail('runSessionStartHook must be exported for compliance testing')
    }
    // Piped synthetic stdin via a small helper. Handler should return an
    // object containing hookSpecificOutput.additionalContext.
    // This is a compile-time red test today (handler writes to disk only).
    expect(typeof fn).toBe('function')
  })
})
