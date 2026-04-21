// GitHub Copilot CLI compliance — TDD spec gate for PR 10.
//
// Target: GitHub Copilot CLI (v1.0.x) — the standalone `copilot` binary,
// NOT VS Code's Copilot extension. These surfaces differ significantly.
//
// Sources (from CHANGELOG + live binary /usr/bin/copilot v1.0.32):
//   CLI CHANGELOG /usr/share/doc/github-copilot-cli-bin/CHANGELOG.md
//   `copilot --help`, `copilot help config`, `copilot mcp --help`
//   Key facts:
//     - MCP config: .mcp.json (not .vscode/mcp.json — removed v1.0.22)
//     - Agents: .github/agents/*.agent.md — auto-discovered by CLI
//     - Hooks: .github/hooks/*.json — Claude Code nested matcher format
//     - Skills: .github/instructions/*.instructions.md (applyTo glob)
//     - Hook event names: PreToolUse, PostToolUse (PascalCase)
//     - Hook tool matchers: Write, Edit, Bash (Claude Code names)

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
  runCli,
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

describe('Copilot: .mcp.json (CLI workspace MCP config)', () => {
  // Copilot CLI v1.0.22 removed .vscode/mcp.json support.
  // Workspace MCP config is now exclusively .mcp.json at the repo root.
  const path = join(K, '.mcp.json')
  const doc = readJsonIfExists<any>(path)

  it('.mcp.json exists', () => {
    expect(doc).not.toBeNull()
  })

  it('declares mcpServers.fulcrum', () => {
    expect(doc?.mcpServers?.fulcrum).toBeDefined()
  })
})

describe('Copilot: path-scoped instructions (.github/instructions/)', () => {
  // CLI loads *.instructions.md files from .github/instructions/ at every
  // directory level up to git root. Files with applyTo globs are injected
  // into context when a matching file is being edited.
  const dir = join(K, '.github/instructions')
  const files = existsSync(dir)
    ? listFilesRec(dir, /\.instructions\.md$/)
    : []

  it('GAP(cp-M2) emits 33 fulcrum-skill-<name>.instructions.md path-scoped files', () => {
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

describe('Copilot: custom agents (.github/agents/*.agent.md)', () => {
  // CLI auto-discovers .github/agents/ in the repo. Each *.agent.md file
  // is a custom agent with YAML frontmatter (name, description, model, skills).
  const dir = join(K, '.github/agents')
  const files = existsSync(dir) ? listDir(dir).filter((f) => f.endsWith('.agent.md')) : []

  it('GAP(cp-M3) emits 24 canonical role MDs as .agent.md files', () => {
    expect(files.length).toBeGreaterThanOrEqual(24)
  })

  it('GAP(cp-S2) chief_of_staff.agent.md lists agents for delegation', () => {
    const cos = files.find((f) => f.endsWith('chief_of_staff.agent.md'))
    if (!cos) return
    const fm = parseFrontmatter(readText(cos))
    // CLI agent format: `agents` field lists sub-agents the CoS may delegate to
    const hasDelegation =
      'handoffs' in (fm ?? {}) || 'agents' in (fm ?? {})
    expect(hasDelegation).toBe(true)
  })
})

describe('Copilot: hooks (.github/hooks/*.json)', () => {
  const hooksPath = join(K, '.github/hooks/fulcrum.json')
  const claudeCompatPath = join(K, '.claude/settings.json')

  it('GAP(cp-M4) emits .github/hooks/fulcrum.json OR .claude/settings.json with hook bindings', () => {
    // CLI reads both paths; .github/hooks/*.json is the primary repo-level path.
    expect(existsSync(hooksPath) || existsSync(claudeCompatPath)).toBe(true)
  })

  it('GAP(cp-M4b) hook tool-name matchers use Copilot CLI tool names (Write, Edit, Bash)', () => {
    // Copilot CLI uses Claude Code-compatible tool names (Write, Edit, Bash),
    // NOT VS Code names (create_file, replace_string_in_file).
    // See: CHANGELOG — "Hook config files now support Claude Code's nested matcher/hooks structure"
    const path = existsSync(hooksPath) ? hooksPath : claudeCompatPath
    if (!existsSync(path)) return
    const raw = readText(path)
    expect(raw).toMatch(/Write|Edit|Bash/)
  })

  it('GAP(cp-M4c) emitted --event hook commands dispatch without unknown-phase errors', () => {
    const tool = runCli(['hook', 'copilot', '--event', 'pre_tool_use', '--tool', 'Write'])
    expect(tool.exitCode).toBe(0)
    expect(tool.stderr).not.toMatch(/Unknown hook phase/)

    const session = runCli(['hook', 'copilot', '--event', 'session_start'])
    expect(session.exitCode).toBe(0)
    expect(session.stderr).not.toMatch(/Unknown hook phase/)
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
    const installSrc = readText(installScriptPath())
    expect(installSrc).toMatch(/\binstallCopilot\b/)
  })
})
