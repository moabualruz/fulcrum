// TEST-C: WAL failure-path coverage — ENOSPC / EROFS / EIO must block the
// write via WalDurabilityError; EAGAIN / EBUSY retry once then proceed.
// Uses the injected fs-impl hook (`__setWalFsImpl`) so we don't mock Node's
// fs module.

import { describe, it, expect, afterEach } from 'vitest'
import { appendWal, brandSanitized, WalDurabilityError, __setWalFsImpl } from '../wal/writer.js'
import type { WalFsImpl } from '../wal/writer.js'

function makeInput() {
  return {
    op: 'WRITE' as const,
    memory_id: 'mem_test_01',
    kind: 'fact',
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    provenance: { hook_point: 'test' },
    content: brandSanitized('hello'),
    sanitize_events: [],
  }
}

function makeThrowingImpl(errno: string, times = Infinity): WalFsImpl {
  let thrown = 0
  return {
    mkdirSync: () => undefined,
    openSync: (() => {
      thrown++
      if (thrown > times) return 42 // fake fd; writeSync+closeSync are no-ops below
      const err = new Error(`simulated ${errno}`) as NodeJS.ErrnoException
      err.code = errno
      throw err
    }) as WalFsImpl['openSync'],
    writeSync: (() => 0) as WalFsImpl['writeSync'],
    closeSync: (() => undefined) as WalFsImpl['closeSync'],
  }
}

describe('WAL errno paths', () => {
  afterEach(() => {
    __setWalFsImpl(null)
  })

  for (const errno of ['ENOSPC', 'EROFS', 'EIO']) {
    it(`throws WalDurabilityError for ${errno}`, () => {
      __setWalFsImpl(makeThrowingImpl(errno, Infinity))
      expect(() => appendWal(makeInput())).toThrow(WalDurabilityError)
    })
  }

  it('retries once on EAGAIN then succeeds', () => {
    __setWalFsImpl(makeThrowingImpl('EAGAIN', 1))
    expect(() => appendWal(makeInput())).not.toThrow()
  })

  it('retries once on EBUSY then succeeds', () => {
    __setWalFsImpl(makeThrowingImpl('EBUSY', 1))
    expect(() => appendWal(makeInput())).not.toThrow()
  })
})
