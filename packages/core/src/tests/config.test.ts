import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { loadConfig, defaultConfig, validateFulcrumConfig } from '../config.js'

// All config reads from globalDataDir()/config.json (never from CWD).
// We point FULCRUM_DATA_DIR at a temp dir to control what gets read.

const TMP_DATA = '/tmp/fulcrum-test-config-data'

beforeEach(() => {
  mkdirSync(TMP_DATA, { recursive: true })
  vi.stubEnv('FULCRUM_DATA_DIR', TMP_DATA)
})

afterEach(() => {
  rmSync(TMP_DATA, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('loadConfig', () => {
  it('returns defaults when no config.json exists', () => {
    const cfg = loadConfig()
    expect(cfg.port).toBe(4721)
    expect(cfg.embedding.text.provider).toBe('local')
    expect(cfg.reranker.device).toBe('auto')
    expect(cfg.policy.wip_limit).toBe(5)
  })

  it('reads values from globalDataDir()/config.json', () => {
    writeFileSync(
      join(TMP_DATA, 'config.json'),
      JSON.stringify({ workspace_id: 'ws_test', project_id: 'proj_test', port: 9999 })
    )
    const cfg = loadConfig()
    expect(cfg.workspace_id).toBe('ws_test')
    expect(cfg.project_id).toBe('proj_test')
    expect(cfg.port).toBe(9999)
  })

  it('env vars override file values', () => {
    writeFileSync(
      join(TMP_DATA, 'config.json'),
      JSON.stringify({ workspace_id: 'ws_file', project_id: 'proj_file', port: 4721 })
    )
    vi.stubEnv('FULCRUM_WORKSPACE_ID', 'ws_env')
    vi.stubEnv('FULCRUM_PORT', '5000')
    const cfg = loadConfig()
    expect(cfg.workspace_id).toBe('ws_env')
    expect(cfg.port).toBe(5000)
  })

  it('merges partial policy config with defaults', () => {
    writeFileSync(
      join(TMP_DATA, 'config.json'),
      JSON.stringify({ workspace_id: 'ws_x', project_id: 'p_x', policy: { wip_limit: 10 } })
    )
    const cfg = loadConfig()
    expect(cfg.policy.wip_limit).toBe(10)
    expect(cfg.policy.heartbeat_timeout_minutes).toBe(10) // default preserved
  })

  it('ignores non-numeric FULCRUM_PORT', () => {
    vi.stubEnv('FULCRUM_PORT', 'abc')
    const cfg = loadConfig()
    expect(cfg.port).toBe(4721) // default preserved
    expect(Number.isNaN(cfg.port)).toBe(false)
  })

  it('falls back to defaults when config.json is malformed JSON', () => {
    writeFileSync(join(TMP_DATA, 'config.json'), '{ this is not valid json }')
    const cfg = loadConfig()
    expect(cfg.port).toBe(4721)
    expect(cfg.policy.wip_limit).toBe(5)
  })

  it('throws with helpful message when config.json has invalid schema', () => {
    writeFileSync(
      join(TMP_DATA, 'config.json'),
      JSON.stringify({ port: 'not-a-number', policy: { wip_limit: -1 } })
    )
    expect(() => loadConfig()).toThrowError(/Invalid config/)
  })

  it('ignores any projectRoot argument (kept for backwards compat)', () => {
    // loadConfig() no longer reads from projectRoot — this should still work and
    // return defaults (no config.json in TMP_DATA at this point)
    const cfg = loadConfig('/some/project/path')
    expect(cfg.port).toBe(4721)
  })
})

describe('validateFulcrumConfig', () => {
  it('returns ok for a valid minimal config', () => {
    const result = validateFulcrumConfig({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(result.ok).toBe(true)
  })

  it('returns ok for a complete valid config', () => {
    const result = validateFulcrumConfig({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      port: 4721,
      embedding: {
        text: { provider: 'local', model: 'some-model', dimensions: 512, device: 'cuda' },
        code: null,
      },
      reranker: { provider: 'local', model: 'reranker-model', device: 'cuda' },
      policy: { wip_limit: 5, heartbeat_timeout_minutes: 10, escalation_timeout_minutes: 30 },
      vault: { path: '/tmp/vault', l2_enabled: false },
    })
    expect(result.ok).toBe(true)
  })

  it('reports error for non-object input', () => {
    const result = validateFulcrumConfig([1, 2, 3])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0)
  })

  it('reports error for invalid port', () => {
    const result = validateFulcrumConfig({ port: 99999 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(e => e.includes('port'))).toBe(true)
  })

  it('reports error for invalid embedding provider', () => {
    const result = validateFulcrumConfig({
      embedding: { text: { provider: 'unknown-provider', model: 'x' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(e => e.includes('provider'))).toBe(true)
  })

  it('reports error for negative wip_limit', () => {
    const result = validateFulcrumConfig({ policy: { wip_limit: -5 } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(e => e.includes('wip_limit'))).toBe(true)
  })

  it('reports multiple errors at once', () => {
    const result = validateFulcrumConfig({
      port: 'oops',
      policy: { wip_limit: -1, heartbeat_timeout_minutes: 0 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('reports error for vault.l2_enabled being non-boolean', () => {
    const result = validateFulcrumConfig({ vault: { l2_enabled: 'yes' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(e => e.includes('l2_enabled'))).toBe(true)
  })

  it('reports error for invalid embedding device', () => {
    const result = validateFulcrumConfig({
      embedding: { text: { provider: 'local', model: 'x', device: 'metal' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('embedding.text.device')
  })

  it('reports error for invalid reranker device', () => {
    const result = validateFulcrumConfig({
      reranker: { provider: 'local', model: 'x', device: 'metal' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('reranker.device')
  })
})
