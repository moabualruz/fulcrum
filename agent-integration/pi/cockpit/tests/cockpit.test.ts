// Unit tests for the Fulcrum PI cockpit extension.
//
// The extension mounts onto PI's ExtensionAPI inside a running agent, so we
// can't exercise the widget render path in a pure Node test. What we CAN
// cover — and what caught two bugs in this session:
//
//   1. computeProjectIds — deterministic hash-based workspace/project IDs,
//      no local config file, env-var override.
//   2. loadCockpitConfig — respects FULCRUM_WORKSPACE_ID / FULCRUM_PROJECT_ID
//      / FULCRUM_PORT, defaults to derived IDs + port 4721.
//   3. Source-level integrity: the file must never read `run.agent_role`
//      on a value that came from the /agents API (that field is named
//      `role` on the server) and must not reference the removed
//      `findConfigFile` helper. These guard the class of bug where a
//      helper gets renamed/deleted but a caller is left behind.

import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildFulcrumFirstNudge,
  computeProjectIds,
  loadCockpitConfig,
  responseDataObject,
  responseList,
} from '../index.js'

const COCKPIT_SRC = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf-8')

describe('computeProjectIds', () => {
  it('is deterministic for the same absolute path', () => {
    const a = computeProjectIds('/home/me/projects/foo')
    const b = computeProjectIds('/home/me/projects/foo')
    expect(a).toEqual(b)
  })

  it('produces different IDs for different paths', () => {
    const a = computeProjectIds('/home/me/projects/foo')
    const b = computeProjectIds('/home/me/projects/bar')
    expect(a.workspace_id).not.toBe(b.workspace_id)
    expect(a.project_id).not.toBe(b.project_id)
  })

  it('derives IDs from the basename + 12-char sha256 prefix', () => {
    const { workspace_id, project_id } = computeProjectIds('/tmp/my-project')
    expect(workspace_id).toMatch(/^ws_my-project_[0-9a-f]{12}$/)
    expect(project_id).toMatch(/^proj_my-project_[0-9a-f]{12}$/)
  })

  it('sanitises special characters in the basename', () => {
    const { workspace_id } = computeProjectIds('/tmp/hello world!@#')
    expect(workspace_id).toMatch(/^ws_hello_world____[0-9a-f]{12}$/)
  })

  it('truncates very long basenames to 24 chars', () => {
    const { workspace_id } = computeProjectIds('/tmp/' + 'x'.repeat(50))
    // "ws_" + up to 24 chars + "_" + 12-char hash
    const name = workspace_id.slice(3, workspace_id.length - 13)
    expect(name.length).toBeLessThanOrEqual(24)
  })
})

describe('loadCockpitConfig', () => {
  const saved = {
    ws:   process.env['FULCRUM_WORKSPACE_ID'],
    proj: process.env['FULCRUM_PROJECT_ID'],
    port: process.env['FULCRUM_PORT'],
  }

  afterEach(() => {
    if (saved.ws   === undefined) delete process.env['FULCRUM_WORKSPACE_ID']; else process.env['FULCRUM_WORKSPACE_ID'] = saved.ws
    if (saved.proj === undefined) delete process.env['FULCRUM_PROJECT_ID'];   else process.env['FULCRUM_PROJECT_ID']   = saved.proj
    if (saved.port === undefined) delete process.env['FULCRUM_PORT'];          else process.env['FULCRUM_PORT']          = saved.port
  })

  it('defaults monitor_port to 4721', () => {
    delete process.env['FULCRUM_PORT']
    const cfg = loadCockpitConfig('/tmp/foo')
    expect(cfg.monitor_port).toBe(4721)
  })

  it('respects FULCRUM_PORT override', () => {
    process.env['FULCRUM_PORT'] = '5555'
    const cfg = loadCockpitConfig('/tmp/foo')
    expect(cfg.monitor_port).toBe(5555)
  })

  it('respects FULCRUM_WORKSPACE_ID / FULCRUM_PROJECT_ID overrides', () => {
    process.env['FULCRUM_WORKSPACE_ID'] = 'ws_custom'
    process.env['FULCRUM_PROJECT_ID']   = 'proj_custom'
    const cfg = loadCockpitConfig('/tmp/foo')
    expect(cfg.workspace_id).toBe('ws_custom')
    expect(cfg.project_id).toBe('proj_custom')
  })

  it('falls back to derived IDs when env vars unset', () => {
    delete process.env['FULCRUM_WORKSPACE_ID']
    delete process.env['FULCRUM_PROJECT_ID']
    const cfg = loadCockpitConfig('/tmp/bar')
    expect(cfg.workspace_id).toMatch(/^ws_bar_[0-9a-f]{12}$/)
    expect(cfg.project_id).toMatch(/^proj_bar_[0-9a-f]{12}$/)
  })
})

describe('monitor API response helpers', () => {
  it('reads current paginated list envelopes', () => {
    const rows = responseList<{ task_id: string }>({ data: [{ task_id: 'task_1' }], pagination: { total: 1 } }, 'tasks')
    expect(rows).toEqual([{ task_id: 'task_1' }])
  })

  it('keeps legacy named list envelopes compatible', () => {
    const rows = responseList<{ workspace_id: string }>({ workspaces: [{ workspace_id: 'ws_1' }] }, 'workspaces')
    expect(rows).toEqual([{ workspace_id: 'ws_1' }])
  })

  it('reads current mutation data envelopes', () => {
    const task = responseDataObject<{ task_id: string }>({ data: { task_id: 'task_1' } })
    expect(task).toEqual({ task_id: 'task_1' })
  })

  it('keeps legacy mutation object responses compatible', () => {
    const task = responseDataObject<{ task_id: string }>({ task_id: 'task_1' })
    expect(task).toEqual({ task_id: 'task_1' })
  })
})

describe('Fulcrum-first prompt nudge', () => {
  it('names the native PI tools agents should prefer before filesystem search', () => {
    const nudge = buildFulcrumFirstNudge('ws_1', 'run_1')
    expect(nudge).toContain('Fulcrum-first')
    expect(nudge).toContain('fulcrum_recall_memory')
    expect(nudge).toContain('fulcrum_workspace_status')
    expect(nudge).toContain('run_1')
  })
})

describe('source-level integrity (regression guards)', () => {
  it('AgentRunRow interface declares field `role`, not `agent_role`', () => {
    // The DB column on agent_runs is `role`; the monitor /agents endpoint
    // returns it as-is. Reading `run.agent_role` would always be undefined
    // and crash the renderer with "Cannot read properties of undefined".
    const match = COCKPIT_SRC.match(/interface AgentRunRow\s*{[\s\S]*?}/)
    expect(match, 'AgentRunRow interface not found').toBeTruthy()
    const body = match![0]
    expect(body).toMatch(/\brole:\s*string/)
    expect(body).not.toMatch(/\bagent_role:\s*string/)
  })

  it('never reads .agent_role on the inbound /agents response path', () => {
    // Outbound uses of agent_role (tool schema, start_agent_run params,
    // command parsing) are correct because that is the server-side
    // parameter name. Inbound reads on AgentRunRow would be wrong.
    // Heuristic: any "run.agent_role" or "a.agent_role" or "x.agent_role"
    // dereference is an inbound read on an AgentRunRow value.
    const offenders = COCKPIT_SRC.match(/\b(?:run|a|x|r|agent)\.agent_role\b/g) ?? []
    expect(offenders, `inbound agent_role reads: ${offenders.join(', ')}`).toHaveLength(0)
  })

  it('does not reference the removed findConfigFile helper', () => {
    // The project-local .fulcrum.json was removed in favour of deterministic
    // IDs; findConfigFile was deleted but a caller in session_start was
    // left behind, crashing PI on extension load.
    expect(COCKPIT_SRC).not.toMatch(/\bfindConfigFile\b/)
  })

  it('does not claim before_provider_request mutates provider payload for Fulcrum-first bias', () => {
    expect(COCKPIT_SRC).toMatch(/buildFulcrumFirstNudge/)
    expect(COCKPIT_SRC).toMatch(/before_provider_request[\s\S]*observational/)
  })
})
