// GitHub Copilot compliance — TDD spec gate for PR 10 (future).
//
// Sources (framework-docs-researcher 2026-04-20; GitHub Copilot in VS Code):
//   docs.github.com/en/copilot/customizing-copilot — surfaces + paths
//   VS Code docs — Agent hooks (Preview), .agent.md, .prompt.md, .vscode/mcp.json
//   code.visualstudio.com/docs/copilot/customization/* — each surface
//
// "No hook layer" claim is WRONG as of 2026-04 — VS Code shipped Agent hooks
// with the same 8 events Claude Code uses + Claude-format compat. Every test
// here reflects the EXPANDED PR 10 scope per the research pass.

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

const K = agentDir('copilot')

describe('Copilot: global workspace instruction', () => {
  const path = join(K, '.github/copilot-instructions.md')

  it('.github/copilot-instructions.md exists', () => {
    expect(existsSync(path)).toBe(true)
  })

  it('GAP(cp-M1) has a sanitized variant for public-repo install (AD-8)', () => {
    // 2026-04-24 privacy policy change: Free/Pro/Pro+ interaction data
    // trains models by default. Anything auto-loaded on a public repo is an
    // exfil channel. Installer must produce a sanitized-public variant.
    const pubPath = join(K, '.github/copilot-instructions.public.md')
    expect(
      existsSync(pubPath) || /FULCRUM_PUBLIC_REPO_VARIANT/.test(readText(path)),
      'no sanitized public-repo variant — MCP host/monitor URLs leak to training data'
    ).toBe(true)
  })
})

describe('Copilot: .vscode/mcp.json', () => {
  const path = join(K, '.vscode/mcp.json')
  const doc = readJsonIfExists<any>(path)

  it('.vscode/mcp.json exists', () => {
    expect(doc).not.toBeNull()
  })

  it('declares servers.fulcrum', () => {
    expect(doc?.servers?.fulcrum).toBeDefined()
  })
})

describe('Copilot: path-scoped instructions', () => {
  const dir = join(K, '.github/instructions')
  const files = existsSync(dir)
    ? listFilesRec(dir, /\.instructions\.md$/)
    : []

  it('GAP(cp-M2) emits 33 fulcrum-skill-<name>.instructions.md path-scoped files', () => {
    // PR 10 scope: 33 canonical skills emitted as path-scoped instructions.
    const skillFiles = files.filter((f) => /fulcrum-skill-/.test(f))
    expect(skillFiles.length).toBeGreaterThanOrEqual(33)
  })

  it('GAP(cp-S1) each has applyTo glob + description frontmatter', () => {
    for (const f of files) {
      const fm = parseFrontmatter(readText(f))
      if (!fm) continue
      expect(fm.applyTo).toBeDefined()
      expect(typeof fm.description).toBe('string')
    }
  })
})

describe('Copilot: custom agents (.agent.md)', () => {
  const dir = join(K, '.github/agents')
  const files = existsSync(dir) ? listDir(dir).filter((f) => f.endsWith('.agent.md')) : []

  it('GAP(cp-M3) emits 24 canonical role MDs as .agent.md files', () => {
    expect(files.length).toBeGreaterThanOrEqual(24)
  })

  it('GAP(cp-S2) chief_of_staff.agent.md lists handoffs/agents for delegation', () => {
    const cos = files.find((f) => f.endsWith('chief_of_staff.agent.md'))
    if (!cos) return
    const fm = parseFrontmatter(readText(cos))
    // At minimum `tools` + `model` + (`handoffs` OR `agents`) per VS Code schema
    const hasDelegation =
      'handoffs' in (fm ?? {}) || 'agents' in (fm ?? {})
    expect(hasDelegation).toBe(true)
  })
})

describe('Copilot: prompt files (.prompt.md)', () => {
  const dir = join(K, '.github/prompts')
  const files = existsSync(dir) ? listDir(dir).filter((f) => f.endsWith('.prompt.md')) : []

  it('GAP(cp-S3) emits fulcrum-* prompt files for user-invokable skills', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
  })
})

describe('Copilot: hooks (.github/hooks/*.json)', () => {
  const hooksPath = join(K, '.github/hooks/fulcrum.json')
  const claudeCompatPath = join(K, '.claude/settings.json')

  it('GAP(cp-M4) emits .github/hooks/fulcrum.json OR .claude/settings.json with hook bindings', () => {
    // VS Code Agent hooks read both paths per docs.
    expect(existsSync(hooksPath) || existsSync(claudeCompatPath)).toBe(true)
  })

  it('GAP(cp-M4b) hook tool-name matchers use VS Code names (create_file, replace_string_in_file)', () => {
    // VS Code tools differ from Claude's: Write→create_file, Edit→replace_string_in_file.
    const path = existsSync(hooksPath) ? hooksPath : claudeCompatPath
    if (!existsSync(path)) return
    const raw = readText(path)
    // At least one matcher must reference the VS Code-native name.
    expect(raw).toMatch(/create_file|replace_string_in_file|run_in_terminal/)
  })
})

describe('Copilot: AGENTS.md at root', () => {
  const path = join(K, 'AGENTS.md')

  it('GAP(cp-S4) AGENTS.md with managed block for always-on summary', () => {
    if (!existsSync(path)) return
    const raw = readText(path)
    expect(raw).toMatch(/BEGIN FULCRUM managed-block/)
  })
})

describe('Copilot: installer entry point', () => {
  it('GAP(cp-M5) installCopilot exported in agent-integration/install.ts', async () => {
    // Installer must exist for PR 10 to ship.
    const installSrc = readText(installScriptPath())
    expect(installSrc).toMatch(/\binstallCopilot\b/)
  })
})
