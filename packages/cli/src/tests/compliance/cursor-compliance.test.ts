// Cursor compliance — TDD spec gate for PR 11 (future, EXPANDED scope).
//
// Sources (framework-docs-researcher 2026-04-20; Cursor 2.4+):
//   cursor.com/docs/context/rules    — .mdc rules frontmatter + Apply Intelligently
//   cursor.com/docs/context/skills   — Anthropic Agent Skills format
//   cursor.com/docs/context/mcp      — .cursor/mcp.json schema
//   cursor.com/docs/agent/hooks      — Cursor DOES have hooks (18+ events)
//   cursor.com/docs/reference/plugins — plugin.json bundle distribution
//
// Research found the original PR 11 scope ("rules-only") is too narrow —
// Cursor has a full six-surface ecosystem (rules, skills, agents, commands,
// hooks, MCP) that maps 1:1 onto Fulcrum's canonical fanout.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  agentDir,
  installScriptPath,
  readText,
  readJsonIfExists,
  parseFrontmatter,
  listDir,
  listFilesRec,
} from './helpers.js'

const R = agentDir('cursor')

describe('Cursor: .cursor/mcp.json', () => {
  const path = join(R, '.cursor/mcp.json')

  it('.cursor/mcp.json exists', () => {
    expect(existsSync(path)).toBe(true)
  })

  it('declares mcpServers.fulcrum (stdio)', () => {
    const doc = readJsonIfExists<any>(path)
    expect(doc?.mcpServers?.fulcrum).toBeDefined()
  })
})

describe('Cursor: core rule (alwaysApply)', () => {
  const path = join(R, '.cursor/rules/fulcrum-core.mdc')

  it('GAP(cu-M1) .cursor/rules/fulcrum-core.mdc exists with alwaysApply: true', () => {
    if (!existsSync(path)) expect.fail('fulcrum-core.mdc not yet emitted — PR 11 scope')
    const fm = parseFrontmatter(readText(path))
    expect(fm?.alwaysApply).toBe(true)
  })

  it('core rule stays under 500-line soft limit', () => {
    if (!existsSync(path)) return
    const lines = readText(path).split('\n').length
    expect(lines).toBeLessThanOrEqual(500)
  })
})

describe('Cursor: 33 per-skill .mdc rules (Agent Requested mode)', () => {
  const dir = join(R, '.cursor/rules')
  const files = existsSync(dir)
    ? listFilesRec(dir, /fulcrum-skill-.*\.mdc$/)
    : []

  it('GAP(cu-M2) 33 fulcrum-skill-*.mdc files emitted', () => {
    expect(files.length).toBeGreaterThanOrEqual(33)
  })

  it('GAP(cu-M2b) each has description set (Agent Requested match signal)', () => {
    // The description field is THE retrieval signal for "Apply Intelligently".
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      expect(fm?.description, `${f} missing description`).toBeDefined()
      expect((fm?.description as string)?.length ?? 0).toBeGreaterThan(8)
    }
  })

  it('each has alwaysApply: false (description-match mode)', () => {
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm || !('alwaysApply' in fm)) continue
      expect(fm.alwaysApply).toBe(false)
    }
  })
})

describe('Cursor: Anthropic-format skills at .cursor/skills/', () => {
  const dir = join(R, '.cursor/skills')
  const files = existsSync(dir) ? listFilesRec(dir, /SKILL\.md$/) : []

  it('GAP(cu-S1) emit 33 SKILL.md files (Cursor 2.4+ migration target)', () => {
    // Cursor 2.4 actively migrates rules → skills via /migrate-to-skills.
    // Emitting skills directly is the strategic bet.
    expect(files.length).toBeGreaterThanOrEqual(33)
  })
})

describe('Cursor: hooks (cursor 2.4+ hook system)', () => {
  const path = join(R, '.cursor/hooks.json')

  it('GAP(cu-M3) .cursor/hooks.json exists with preToolUse/postToolUse/sessionStart', () => {
    if (!existsSync(path)) expect.fail('.cursor/hooks.json missing — Cursor hooks unbind PR 11 scope')
    const doc = readJsonIfExists<any>(path)
    const h = doc?.hooks ?? {}
    for (const e of ['preToolUse', 'postToolUse', 'sessionStart']) {
      expect(h).toHaveProperty(e)
    }
  })

  it('version field declared (schema version 1)', () => {
    if (!existsSync(path)) return
    const doc = readJsonIfExists<any>(path)
    expect(doc?.version).toBe(1)
  })
})

describe('Cursor: slash commands', () => {
  const dir = join(R, '.cursor/commands')
  const files = existsSync(dir) ? listDir(dir).filter((f) => f.endsWith('.md')) : []

  it('GAP(cu-S2) emit fulcrum-* commands for user-invokable skills', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })
})

describe('Cursor: installer coverage', () => {
  it('GAP(cu-M4) installCursor covers rules + skills + hooks + commands (not rules-only)', () => {
    const installSrc = readText(installScriptPath())
    const mentions = {
      rules: /fulcrum-core\.mdc|\.cursor\/rules\//.test(installSrc),
      skills: /\.cursor\/skills\//.test(installSrc),
      hooks: /\.cursor\/hooks\.json/.test(installSrc),
      commands: /\.cursor\/commands\//.test(installSrc),
    }
    for (const [surface, seen] of Object.entries(mentions)) {
      expect(seen, `installCursor missing ${surface} emission`).toBe(true)
    }
  })
})
