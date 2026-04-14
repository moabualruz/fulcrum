import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HEARTBEAT_TIMEOUT_SEC,
  DEFAULT_ESCALATION_TIMEOUT_SEC,
  DEFAULT_WIP_LIMIT,
  DEFAULT_MONITOR_PORT,
  DEFAULT_EMBED_DIM,
  DEFAULT_LOCK_TTL_SEC,
  JANITOR_INTERVAL_SEC,
  MEMORY_RANK_WEIGHTS,
} from '../constants.js'

describe('constants', () => {
  it('heartbeat timeout is 10 minutes', () => {
    expect(DEFAULT_HEARTBEAT_TIMEOUT_SEC).toBe(600)
  })
  it('escalation timeout is 30 minutes', () => {
    expect(DEFAULT_ESCALATION_TIMEOUT_SEC).toBe(1800)
  })
  it('default WIP is 3', () => {
    expect(DEFAULT_WIP_LIMIT).toBe(3)
  })
  it('monitor port is 4721', () => {
    expect(DEFAULT_MONITOR_PORT).toBe(4721)
  })
  it('embedding dim is 1024', () => {
    expect(DEFAULT_EMBED_DIM).toBe(1024)
  })
  it('lock TTL is 15 minutes', () => {
    expect(DEFAULT_LOCK_TTL_SEC).toBe(900)
  })
  it('janitor interval is 60s', () => {
    expect(JANITOR_INTERVAL_SEC).toBe(60)
  })
  it('ranking weights sum to 1.0', () => {
    const sum = MEMORY_RANK_WEIGHTS.semantic + MEMORY_RANK_WEIGHTS.lexical +
                MEMORY_RANK_WEIGHTS.recency + MEMORY_RANK_WEIGHTS.confidence
    expect(sum).toBeCloseTo(1.0, 6)
  })
})
