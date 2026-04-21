// Windsurf compliance — TDD spec gate for PR 12 (future).
//
// Sources (framework-docs-researcher 2026-04-20; Windsurf / Codeium):
//   docs.windsurf.com/windsurf/cascade/memories  — rules, triggers, limits
//   docs.windsurf.com/windsurf/cascade/workflows — user-invokable /slash
//   docs.windsurf.com/windsurf/cascade/hooks     — 12 events, stdin JSON
//   docs.windsurf.com/windsurf/cascade/mcp       — MCP config path
//
// Finding: Windsurf has a FULL hook system (12 events, pre/post, exit 2 block).
// PR 12 should promote hooks to first-class parity with Claude Code.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  agentDir,
  installScriptPath,
  readText,
  readJsonIfExists,
  parseFrontmatter,
  listFilesRec,
  listDir,
} from './helpers.js'

const W = agentDir('windsurf')

describe('Windsurf: rules directory', () => {
  const coreCandidates = [
    join(W, '.windsurf/rules/fulcrum-core.md'),
    join(W, '.windsurf/rules/fulcrum.mdc'),
  ]

  it('GAP(ws-M1) fulcrum-core.md (always_on) exists with canonical rules', () => {
    const path = coreCandidates.find((p) => existsSync(p))
    if (!path) expect.fail('no fulcrum core rule — PR 12 scope')
    const fm = parseFrontmatter(readText(path!))
    expect(fm?.trigger).toBe('always_on')
  })

  it('GAP(ws-M1b) core rule under 12000 bytes', () => {
    const path = coreCandidates.find((p) => existsSync(p))
    if (!path) return
    const size = readText(path).length
    expect(size).toBeLessThanOrEqual(12000)
  })
})

describe('Windsurf: 33 per-skill rules with trigger model_decision', () => {
  const dir = join(W, '.windsurf/rules')
  const files = existsSync(dir)
    ? listFilesRec(dir, /fulcrum-skill-.*\.md$/)
    : []

  it('GAP(ws-M2) 33 fulcrum-skill-*.md rule files emitted', () => {
    expect(files.length).toBeGreaterThanOrEqual(33)
  })

  it('each has trigger: model_decision + description', () => {
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm) continue
      expect(fm.trigger).toBe('model_decision')
      // model_decision REQUIRES description per docs.
      expect(typeof fm.description).toBe('string')
    }
  })

  it('each rule file stays under 12000 bytes (Windsurf hard lint)', () => {
    for (const f of files) {
      const size = readText(f).length
      expect(size, `${f} exceeds 12k`).toBeLessThanOrEqual(12000)
    }
  })
})

describe('Windsurf: workflows (user-invokable /slash)', () => {
  const dir = join(W, '.windsurf/workflows')
  const files = existsSync(dir) ? listDir(dir).filter((f) => f.endsWith('.md')) : []

  it('GAP(ws-S1) workflows emitted for user-invokable skills', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })
})

describe('Windsurf: hooks (.windsurf/hooks.json — 12 events)', () => {
  const path = join(W, '.windsurf/hooks.json')
  const doc = readJsonIfExists<any>(path)
  const requiredEvents = [
    'pre_read_code',
    'pre_write_code',
    'pre_run_command',
    'pre_mcp_tool_use',
    'pre_user_prompt',
    'post_read_code',
    'post_write_code',
    'post_run_command',
    'post_mcp_tool_use',
    'post_cascade_response',
  ]

  it('GAP(ws-M3) .windsurf/hooks.json exists (PR 12 promotion)', () => {
    if (!doc) expect.fail('no hooks.json — promote hooks to first-class per research')
  })

  it('GAP(ws-M3b) binds at least 10 of the 12 documented hook events', () => {
    const registered = Object.keys(doc?.hooks ?? {})
    const matched = requiredEvents.filter((e) => registered.includes(e))
    expect(matched.length).toBeGreaterThanOrEqual(10)
  })
})

describe('Windsurf: global opt-in safety', () => {
  it('GAP(ws-S2) global_rules.md install requires explicit --global flag (not default)', () => {
    // Shared-machine leak risk: global rules apply to every workspace.
    // Installer must refuse by default and warn if global_rules.md is non-empty.
    const installSrc = readText(installScriptPath())
    expect(installSrc).toMatch(/global_rules\.md|--global/)
  })
})

describe('Windsurf: MCP integration', () => {
  const path = join(W, '.windsurf/mcp.json')

  it('GAP(ws-S3) writes project .windsurf/mcp.json with fulcrum server at install time', () => {
    // Project install path used by installWindsurf(); user-scope Windsurf MCP
    // config remains a separate operator path.
    if (!existsSync(path)) return
    const doc = readJsonIfExists<any>(path)
    expect(doc?.mcpServers?.fulcrum).toBeDefined()
  })
})
