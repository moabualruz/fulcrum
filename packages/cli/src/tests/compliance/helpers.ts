// Shared utilities for cross-agent CLI compliance tests.
//
// These tests assert that Fulcrum's emitted artifacts + hook handlers conform
// to each target CLI's documented extension contract. Sources for every
// assertion are cited inline at the test site; citations point at the research
// pass that produced them (see docs/reference/2026-04-19-*-extension-surface.md
// + the framework-docs-researcher sweep of 2026-04-20).
//
// Suite philosophy: fail red until fixed. The suite is the PR 7 spec gate —
// checklist ✅ can only flip when the compliance test for that row is green.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const here = dirname(fileURLToPath(import.meta.url))

// packages/cli/src/tests/compliance/ -> repo root
export const repoRoot = resolve(here, '../../../../..')

export const agentDir = (agent: string): string =>
  join(repoRoot, 'agent-integration', agent)

export const installScriptPath = (): string =>
  join(repoRoot, 'agent-integration', 'install.ts')

export function readText(p: string): string {
  return readFileSync(p, 'utf8')
}

export function readJsonIfExists<T = unknown>(p: string): T | null {
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

export function readJsonc<T = unknown>(p: string): T {
  // strip // and /* */ comments, then JSON.parse
  const raw = readFileSync(p, 'utf8')
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return JSON.parse(stripped) as T
}

// Parse a narrow subset of YAML frontmatter at the top of a markdown file.
// Returns null if no frontmatter. Handles flat key: value, list (indented `-`),
// and nested one-level `key:\n  sub: value`. Sufficient for our agent MDs.
export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return null
  return parseYamlIsh(m[1]!)
}

function parseYamlIsh(body: string): Record<string, unknown> {
  const lines = body.split('\n')
  const out: Record<string, unknown> = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim() || line.trim().startsWith('#')) {
      i++
      continue
    }
    const flat = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!flat) {
      i++
      continue
    }
    const key = flat[1]!
    let rest = flat[2]!
    // list that starts on same line: key: [a, b]
    if (rest.startsWith('[') && rest.endsWith(']')) {
      out[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean)
      i++
      continue
    }
    // inline scalar
    if (rest !== '') {
      out[key] = coerce(rest)
      i++
      continue
    }
    // multiline: inspect next non-blank line
    const children: string[] = []
    const nestedPairs: Array<[string, string]> = []
    let j = i + 1
    let kind: 'list' | 'map' | null = null
    while (j < lines.length) {
      const next = lines[j]!
      if (next === '' || next.trim().startsWith('#')) {
        j++
        continue
      }
      if (!/^\s/.test(next)) break // dedent back to root
      const listMatch = next.match(/^\s+-\s+(.*)$/)
      const mapMatch = next.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/)
      if (listMatch) {
        kind = kind ?? 'list'
        if (kind === 'list') children.push(stripQuotes(listMatch[1]!))
      } else if (mapMatch) {
        kind = kind ?? 'map'
        if (kind === 'map') nestedPairs.push([mapMatch[1]!, mapMatch[2]!])
      }
      j++
    }
    if (kind === 'list') out[key] = children
    else if (kind === 'map') {
      const sub: Record<string, unknown> = {}
      for (const [k, v] of nestedPairs) sub[k] = coerce(v)
      out[key] = sub
    } else {
      out[key] = ''
    }
    i = j
  }
  return out
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function coerce(s: string): unknown {
  const t = stripQuotes(s.trim())
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  return t
}

// Minimal TOML reader for the shapes we emit (flat keys, [section],
// [[array_of_tables]], string / number / boolean / string-array values).
// Sufficient for Codex config.toml + Gemini policies/*.toml assertions.
export function parseToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  const arrayTables: Record<string, Array<Record<string, unknown>>> = {}
  let cur: Record<string, unknown> = root
  let curPath: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/(^|[^\\])#.*$/, '$1').trim()
    if (!line) continue
    const arr = line.match(/^\[\[(.+?)\]\]$/)
    if (arr) {
      const name = arr[1]!.trim()
      if (!arrayTables[name]) {
        arrayTables[name] = []
        root[name] = arrayTables[name]
      }
      const table: Record<string, unknown> = {}
      arrayTables[name]!.push(table)
      cur = table
      curPath = [name]
      continue
    }
    const sec = line.match(/^\[(.+?)\]$/)
    if (sec) {
      const parts = sec[1]!.split('.')
      let node: Record<string, unknown> = root
      for (const part of parts) {
        if (!(part in node) || typeof node[part] !== 'object') {
          node[part] = {}
        }
        node = node[part] as Record<string, unknown>
      }
      cur = node
      curPath = parts
      continue
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]!
    const val = kv[2]!.trim()
    cur[key] = parseTomlValue(val)
  }
  return root
}

function parseTomlValue(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('"""') && v.endsWith('"""')) return v.slice(3, -3)
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((s) => parseTomlValue(s.trim()))
      .filter((x) => x !== '')
  }
  return v
}

export function listDir(p: string): string[] {
  if (!existsSync(p)) return []
  return readdirSync(p).map((name) => join(p, name))
}

export function listFilesRec(p: string, match: RegExp): string[] {
  if (!existsSync(p)) return []
  const out: string[] = []
  for (const name of readdirSync(p)) {
    const full = join(p, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...listFilesRec(full, match))
    else if (match.test(name)) out.push(full)
  }
  return out
}

// Invoke the CLI with argv. Feeds synthetic stdin when provided. Returns
// {stdout, stderr, exitCode}. Used to black-box test hook handlers end-to-end.
export function runCli(argv: string[], stdin: string = ''): {
  stdout: string
  stderr: string
  exitCode: number
} {
  const cliEntry = join(repoRoot, 'packages/cli/src/index.ts')
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', cliEntry, ...argv],
    {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, FULCRUM_NO_MONITOR: '1' },
      timeout: 10_000,
    }
  )
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  }
}

export function parseStdoutJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  return JSON.parse(trimmed)
}
