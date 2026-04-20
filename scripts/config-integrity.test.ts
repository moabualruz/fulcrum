// Config integrity tests for every shipped agent integration.
//
// Catches the class of bug we saw repeatedly in this repo: a config
// references a `fulcrum <group> <command>` that the CLI dispatcher no
// longer knows about (or never knew about), and every hook fire in a
// user's install errors out.
//
// Each assertion points at a specific shipped config file. Keeping this
// green is the condition for merging any new subcommand or phase name.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..')
const INT_DIR = join(REPO_ROOT, 'agent-integration')

// ─── Accept lists — derived from packages/cli/src/index.ts dispatcher ────────

const HOOK_CLIS = new Set([
  'auto', 'claude', 'gemini', 'codex', 'pi', 'opencode', 'cursor', 'windsurf',
])

const HOOK_PHASES_COMMON = new Set([
  'pre', 'post',
])

const HOOK_PHASES_BY_CLI: Record<string, Set<string>> = {
  claude:   new Set(['session-start', 'session-stop', 'session-end', 'pre-compact', 'subagent-start', 'subagent-stop', 'user-prompt-submit', 'notification']),
  gemini:   new Set(['session-start', 'session-end', 'before-agent', 'before-model', 'after-model', 'pre-compress', 'after-agent']),
  codex:    new Set(['session-start', 'session-end', 'notify']),
  opencode: new Set(['session-start', 'session-end', 'pre-compact']),
  cursor:   new Set(['session-start', 'session-end', 'pre-compact']),
  windsurf: new Set(['session-start', 'session-end', 'pre-compact']),
  pi:       new Set<string>(),
  auto:     new Set<string>(),
}

const SERVE_COMMANDS    = new Set(['mcp', 'monitor', 'all'])
const MEMORY_COMMANDS   = new Set(['init', 'accelerate', 'rebuild', 'embed', 'status'])
const TOP_LEVEL_GROUPS  = new Set([
  'hook', 'serve', 'memory', 'task', 'issue', 'epic', 'workspace', 'workspaces',
  'project', 'projects', 'action', 'actions', 'tool', 'tools', 'mcp', 'install',
  'doctor', 'dream', 'cockpit', 'skills', 'sweep', 'agent', 'agents',
])

// ─── File enumeration ───────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function stripJsonComments(s: string): string {
  // Handle // line comments and /* block */ comments for jsonc.
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function readConfig(p: string): unknown {
  const raw = readFileSync(p, 'utf-8')
  const ext = extname(p)
  if (ext === '.json')  return JSON.parse(raw)
  if (ext === '.jsonc') return JSON.parse(stripJsonComments(raw))
  if (ext === '.toml')  return raw // return raw — we grep commands out of TOML below
  return null
}

/** Collect every string literal that starts with "fulcrum " from any JSON/JSONC/TOML value. */
function collectFulcrumCommands(p: string): string[] {
  const raw = readFileSync(p, 'utf-8')
  const out: string[] = []
  // Match "fulcrum …" inside double quotes only (JSON/JSONC/TOML string literals).
  const re = /"(fulcrum\s+[^"]+)"/g
  let m
  while ((m = re.exec(raw)) !== null) out.push(m[1]!.trim())
  return out
}

function parseCommand(cmd: string): string[] {
  return cmd.split(/\s+/).filter(Boolean)
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('agent-integration config integrity', () => {
  const configFiles = walk(INT_DIR).filter(p =>
    /\.(json|jsonc|toml)$/.test(p) &&
    !p.includes('/node_modules/') &&
    !p.includes('/.codex-plugin/')  // skip the plugin manifest, it's a different schema
  )

  it('finds at least one config in every agent directory', () => {
    const agents = ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode', 'pi', 'windsurf']
    for (const a of agents) {
      const found = configFiles.filter(f => f.includes(`/agent-integration/${a}/`))
      expect(found.length, `no configs in agent-integration/${a}/`).toBeGreaterThan(0)
    }
  })

  describe('JSON / JSONC parse cleanly', () => {
    for (const p of configFiles.filter(f => /\.(json|jsonc)$/.test(f))) {
      const rel = p.slice(REPO_ROOT.length + 1)
      it(rel, () => {
        expect(() => readConfig(p)).not.toThrow()
      })
    }
  })

  describe('every fulcrum command reference targets a known dispatcher path', () => {
    for (const p of configFiles) {
      const rel  = p.slice(REPO_ROOT.length + 1)
      const cmds = collectFulcrumCommands(p)
      if (cmds.length === 0) continue
      it(rel, () => {
        for (const cmd of cmds) {
          const parts = parseCommand(cmd)
          // parts[0] is always "fulcrum"
          const group = parts[1]
          expect(
            group && TOP_LEVEL_GROUPS.has(group),
            `${cmd}  →  unknown top-level group "${group}"`,
          ).toBe(true)

          if (group === 'hook') {
            const cli = parts[2]
            expect(
              cli && HOOK_CLIS.has(cli),
              `${cmd}  →  unknown hook CLI "${cli}"`,
            ).toBe(true)
            const phase = parts[3]
            if (phase && !phase.startsWith('--')) {
              const allowed = new Set([
                ...HOOK_PHASES_COMMON,
                ...(HOOK_PHASES_BY_CLI[cli!] ?? []),
              ])
              expect(
                allowed.has(phase),
                `${cmd}  →  hook phase "${phase}" not in accept list for ${cli}`,
              ).toBe(true)
            }
          }

          if (group === 'serve') {
            const sub = parts[2]
            expect(
              sub && SERVE_COMMANDS.has(sub),
              `${cmd}  →  unknown serve command "${sub}"`,
            ).toBe(true)
          }

          if (group === 'memory') {
            const sub = parts[2]
            expect(
              sub && MEMORY_COMMANDS.has(sub),
              `${cmd}  →  unknown memory command "${sub}"`,
            ).toBe(true)
          }
        }
      })
    }
  })

  it('every MCP server definition binds the "fulcrum" command', () => {
    for (const p of configFiles.filter(f => /\.(json|jsonc)$/.test(f))) {
      const cfg = readConfig(p) as Record<string, unknown>
      const servers = (cfg['mcpServers'] ?? cfg['mcp']?.['servers']) as Record<string, { command?: string; args?: string[] }> | undefined
      if (!servers) continue
      for (const [name, def] of Object.entries(servers)) {
        if (!name.toLowerCase().includes('fulcrum')) continue
        expect(def.command, `${p} → mcp server ${name} missing command`).toBeDefined()
        // Either direct `fulcrum` binary, `npx fulcrum-mcp`, `node path/to/bin`, or the cli binary.
        const cmd = def.command!
        const args = def.args ?? []
        const combined = [cmd, ...args].join(' ')
        expect(
          /fulcrum/.test(combined),
          `${p} → ${name}: command chain "${combined}" does not invoke any fulcrum binary`,
        ).toBe(true)
      }
    }
  })
})
