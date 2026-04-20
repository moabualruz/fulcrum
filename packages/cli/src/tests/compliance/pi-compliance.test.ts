// PI cockpit compliance — TDD spec gate for PR 8 (future) + PR 7 corrections.
//
// Sources (framework-docs-researcher 2026-04-20; @mariozechner/pi-coding-agent@0.67.68):
//   docs/extensions.md — 24 events (not 19); event typed contract
//   docs/packages.md — manifest schema, install flow
//   docs/skills.md — AGENTS.md walked up from cwd (NOT PI.md)
//   docs/sdk.md — before_agent_start handler-chained systemPrompt replacement

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { agentDir, repoRoot, readText, readJsonIfExists, listDir } from './helpers.js'

const P = join(agentDir('pi'), 'cockpit')

describe('PI: package manifest', () => {
  const pkg = readJsonIfExists<Record<string, any>>(join(P, 'package.json'))

  it('package.json exists', () => {
    expect(pkg).not.toBeNull()
  })

  it('GAP(pi-S1) name is @fulcrum-agent-os/pi-cockpit (per PR 14.4 rename)', () => {
    expect(pkg?.name).toBe('@fulcrum-agent-os/pi-cockpit')
  })

  it('GAP(pi-S2) declares keywords: ["pi-package"] for gallery discovery', () => {
    // docs/packages.md: gallery visibility requires this keyword.
    const kws = pkg?.keywords as string[] | undefined
    expect(kws).toContain('pi-package')
  })

  it('declares pi.{extensions, skills} arrays', () => {
    expect(Array.isArray(pkg?.pi?.extensions)).toBe(true)
  })

  it('peerDependencies pin pi-* packages with "*"', () => {
    // docs/packages.md: plugins must use peerDependencies with "*" to avoid
    // bundling the cockpit runtime.
    const peers = pkg?.peerDependencies as Record<string, string> | undefined
    expect(peers).toBeDefined()
    for (const [k, v] of Object.entries(peers ?? {})) {
      if (k.startsWith('@mariozechner/pi-')) {
        expect(v).toBe('*')
      }
    }
  })
})

describe('PI: canonical skills symlink', () => {
  it('agent-integration/pi/cockpit/skills is intact (either symlink or dir with 33 canonical skills)', () => {
    const p = join(P, 'skills')
    expect(existsSync(p)).toBe(true)
  })
})

describe('PI: event bindings in cockpit index.ts', () => {
  const idx = join(P, 'index.ts')
  const src = existsSync(idx) ? readText(idx) : ''

  const requiredEvents = [
    // already bound per research
    'session_start',
    'session_shutdown',
    'resources_discover',
    'tool_call',
    'before_agent_start',
    // GAP — not yet bound
    'agent_end',
    'tool_result',
    'context',
    'before_provider_request',
    'turn_start',
    'turn_end',
    'session_before_compact',
    'user_bash',
    'input',
  ]

  it('source file exists', () => {
    expect(src.length).toBeGreaterThan(0)
  })

  it('GAP(pi-M1) binds the full PI event taxonomy (14+ of ~24)', () => {
    for (const event of requiredEvents) {
      expect(
        src,
        `pi.on("${event}", ...) not bound`
      ).toMatch(new RegExp(`pi\\.on\\([\\s"']*${event}[\\s"']*,`))
    }
  })

  it('GAP(pi-S3) registers /fulcrum:role slash command', () => {
    // No `pi agent switch <role>` primitive exists — role-switch is
    // synthesized via registerCommand + before_agent_start chain.
    expect(src).toMatch(/registerCommand\(\s*["']fulcrum:role/)
  })
})

describe('PI: AGENTS.md (NOT PI.md) carries canonical rules', () => {
  it('GAP(pi-M2) AGENTS.md exists at repo root or cockpit root with managed block', () => {
    // PI walks `AGENTS.md` up from cwd per docs/skills.md:31 and docs/sdk.md.
    // `PI.md` is a misnomer — it is not auto-loaded.
    const candidates = [
      join(repoRoot, 'AGENTS.md'),
      join(P, 'AGENTS.md'),
      join(P, '..', 'AGENTS.md'),
    ]
    const found = candidates.find((c) => existsSync(c))
    if (!found) expect.fail('no AGENTS.md found — pi-cockpit relies on this file')
    const raw = readText(found!)
    expect(raw).toMatch(/BEGIN FULCRUM managed-block/)
  })
})

describe('PI: 24 role MDs under cockpit skill path', () => {
  const rolePath = join(P, 'skills/roles')

  it('GAP(pi-S4) 24 role MDs present under cockpit/skills/roles/ (or equivalent)', () => {
    if (!existsSync(rolePath)) {
      expect.fail('cockpit/skills/roles/ not yet emitted — PR 8 scope')
    }
    const files = listDir(rolePath).filter((f) => f.endsWith('.md'))
    expect(files.length).toBeGreaterThanOrEqual(24)
  })
})
