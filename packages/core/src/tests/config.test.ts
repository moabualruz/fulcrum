import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { loadConfig, defaultConfig } from '../config.js'

const TMP = '/tmp/fulcrum-test-config'

beforeEach(() => mkdirSync(TMP, { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('loadConfig', () => {
  it('returns defaults when no file exists', () => {
    const cfg = loadConfig(join(TMP, 'nonexistent'))
    expect(cfg.port).toBe(4721)
    expect(cfg.embedding.text.provider).toBe('local')
    expect(cfg.policy.wip_limit).toBe(5)
  })

  it('reads values from .fulcrum.json', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_test', project_id: 'proj_test', port: 9999 })
    )
    const cfg = loadConfig(TMP)
    expect(cfg.workspace_id).toBe('ws_test')
    expect(cfg.project_id).toBe('proj_test')
    expect(cfg.port).toBe(9999)
  })

  it('env vars override file values', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_file', project_id: 'proj_file', port: 4721 })
    )
    process.env.FULCRUM_WORKSPACE_ID = 'ws_env'
    process.env.FULCRUM_PORT = '5000'
    const cfg = loadConfig(TMP)
    expect(cfg.workspace_id).toBe('ws_env')
    expect(cfg.port).toBe(5000)
    delete process.env.FULCRUM_WORKSPACE_ID
    delete process.env.FULCRUM_PORT
  })

  it('merges partial policy config with defaults', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_x', project_id: 'p_x', policy: { wip_limit: 10 } })
    )
    const cfg = loadConfig(TMP)
    expect(cfg.policy.wip_limit).toBe(10)
    expect(cfg.policy.heartbeat_timeout_minutes).toBe(10) // default preserved
  })
})
