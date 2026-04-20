// Codex CLI compliance — TDD spec gate for PR 7 expanded scope.
//
// Sources (framework-docs-researcher 2026-04-20; openai/codex main):
//   codex-rs/hooks/src/engine/discovery.rs  — reads hooks.json, not TOML
//   codex-rs/hooks/src/engine/config.rs     — HooksFile JSON shape
//   codex-rs/config/src/config_toml.rs      — valid TOML keys
//   codex-rs/core-plugins/src/manifest.rs   — plugin.json schema + limits
//   codex-rs/core-plugins/src/marketplace.rs — resolve_plugin_source
//   codex-rs/core-skills/src/loader.rs      — SKILL.md + openai.yaml

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  agentDir,
  repoRoot,
  readText,
  readJsonIfExists,
  parseToml,
  listDir,
} from './helpers.js'

const X = agentDir('codex')

describe('Codex: hook discovery carrier', () => {
  const configTomlPath = join(X, 'config.toml')
  const hooksJsonPath = join(X, 'hooks.json')
  // Also check plugin-bundled path (installer may also write ~/.codex/hooks.json
  // at runtime — the source-of-truth for CI is the repo copy).
  const pluginHooksPath = join(X, 'plugin/hooks.json')

  it('GAP(codex-M1) hooks land in hooks.json (JSON), NOT config.toml', () => {
    // discovery.rs walks `folder.join("hooks.json")` + parses as JSON.
    // config_toml.rs has NO `hooks` key. Our [[hooks]] TOML blocks are dead.
    const tomlHasHooks =
      existsSync(configTomlPath) &&
      /^\[\[hooks\]\]/m.test(readText(configTomlPath))
    expect(tomlHasHooks).toBe(false)

    const jsonExists =
      existsSync(hooksJsonPath) || existsSync(pluginHooksPath)
    expect(jsonExists).toBe(true)
  })

  it('GAP(codex-M1b) hooks.json binds SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, Stop', () => {
    const path = existsSync(hooksJsonPath) ? hooksJsonPath : pluginHooksPath
    const hooks = readJsonIfExists<{ hooks?: Record<string, unknown> }>(path)
    const registered = Object.keys(hooks?.hooks ?? {})
    for (const e of [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'Stop',
    ]) {
      expect(registered, `${e} event missing`).toContain(e)
    }
  })
})

describe('Codex: config.toml valid keys only', () => {
  const path = join(X, 'config.toml')

  it('config.toml exists', () => {
    expect(existsSync(path)).toBe(true)
  })

  it('GAP(codex-M2) `notify` is a flat string array at root (not `[notify] command = "..."` table)', () => {
    // config_toml.rs:118-120 — `pub notify: Option<Vec<String>>`.
    if (!existsSync(path)) return
    const raw = readText(path)
    if (!/^\[notify\]/m.test(raw) && !/^notify\s*=/m.test(raw)) return
    const doc = parseToml(raw)
    expect(Array.isArray(doc.notify)).toBe(true)
  })

  it('GAP(codex-M3) does not use fake `[tool_approval.invoke_team]` TOML section', () => {
    if (!existsSync(path)) return
    const raw = readText(path)
    expect(raw).not.toMatch(/^\[tool_approval\.invoke_team\]/m)
  })
})

describe('Codex: plugin.json interface block', () => {
  const path = join(X, 'plugin/.codex-plugin/plugin.json')
  const manifest = readJsonIfExists<Record<string, unknown>>(path)

  it('plugin.json exists', () => {
    expect(manifest).not.toBeNull()
  })

  it('defaultPrompt respects MAX 3 entries of MAX 128 chars', () => {
    // manifest.rs:9-10: MAX_DEFAULT_PROMPT_COUNT = 3, MAX_DEFAULT_PROMPT_LEN = 128.
    const prompts = manifest?.defaultPrompt as string[] | undefined
    if (!prompts) return
    expect(prompts.length).toBeLessThanOrEqual(3)
    for (const p of prompts) {
      expect(p.length).toBeLessThanOrEqual(128)
    }
  })

  it('GAP(codex-S1) capabilities use upstream-recognized labels (not invented strings)', () => {
    // marketplace_tests.rs shows upstream uses capitalized verbs like
    // "Interactive", "Write", "Background". Our invented strings
    // ("task_management", "memory", ...) render verbatim in the Codex UI.
    const iface = manifest?.interface as Record<string, unknown> | undefined
    const caps = iface?.capabilities as string[] | undefined
    if (!caps) return
    for (const c of caps) {
      expect(
        /^[A-Z][a-zA-Z]*$/.test(c),
        `capability "${c}" is invented taxonomy; upstream expects capitalized verbs`
      ).toBe(true)
    }
  })

  it('GAP(codex-S2) category is capitalized per upstream convention', () => {
    const iface = manifest?.interface as Record<string, unknown> | undefined
    const cat = iface?.category as string | undefined
    if (cat) {
      expect(/^[A-Z]/.test(cat)).toBe(true)
    }
  })
})

describe('Codex: 33 canonical skills + openai.yaml sidecars', () => {
  const skillsDir = join(X, 'plugin/skills')
  const skillDirs = listDir(skillsDir).filter(
    (f) =>
      f.split('/').pop()?.startsWith('fulcrum-') &&
      existsSync(join(f, 'SKILL.md'))
  )

  it('33 SKILL.md dirs present', () => {
    expect(skillDirs.length).toBe(33)
  })

  it('every skill has a companion openai.yaml sidecar', () => {
    for (const d of skillDirs) {
      expect(existsSync(join(d, 'agents/openai.yaml'))).toBe(true)
    }
  })
})

describe('Codex: shared marketplace entry', () => {
  const doc = readJsonIfExists<any>(join(repoRoot, '.claude-plugin/marketplace.json'))

  it('includes Codex plugin entry with source resolving to plugin dir', () => {
    const plugins = doc?.plugins as Array<any> | undefined
    const codex = plugins?.find(
      (p) => typeof p.source === 'string' && /codex\/plugin/.test(p.source)
    )
    expect(codex).toBeDefined()
  })
})

describe('Codex: AGENTS.md marker block', () => {
  const path = join(X, 'AGENTS.md')

  it('GAP(codex-M4) AGENTS.md has BEGIN/END FULCRUM managed-block (currently ⬜)', () => {
    if (!existsSync(path)) {
      expect.fail('AGENTS.md does not exist yet — ⬜ pending PR 7 expansion')
    }
    const raw = readText(path)
    expect(raw).toMatch(/BEGIN FULCRUM managed-block/)
  })
})
