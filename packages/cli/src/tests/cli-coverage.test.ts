// packages/cli/src/tests/cli-coverage.test.ts
//
// J-6 smoke tests: verifies the 9 new command groups export their
// dispatch function and that the CLI output helpers work. These are
// intentionally lightweight — they import the module (catching typos
// and broken type imports at load time) and call the helpers that
// don't touch the DB. Full end-to-end coverage lives in the
// integration test suite for each core package.

import { describe, it, expect, vi } from 'vitest'

describe('CLI coverage groups (J-6)', () => {
  it('outputRows prints JSON when --json passed via argv', async () => {
    const originalArgv = process.argv
    process.argv = ['node', 'cli', '--json']
    try {
      // Re-import with fresh argv so the top-level `args` closure picks up --json.
      vi.resetModules()
      const mod = await import('../index.js')
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      mod.outputRows([{ a: 1, b: 'x' }])
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"a": 1'))
      spy.mockRestore()
    } finally {
      process.argv = originalArgv
    }
  })

  it('outputRows prints (no rows) for an empty list', async () => {
    const originalArgv = process.argv
    process.argv = ['node', 'cli']
    try {
      vi.resetModules()
      const mod = await import('../index.js')
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      mod.outputRows([])
      expect(spy).toHaveBeenCalledWith('(no rows)')
      spy.mockRestore()
    } finally {
      process.argv = originalArgv
    }
  })

  it('outputRows prints header + data row as tab-separated', async () => {
    const originalArgv = process.argv
    process.argv = ['node', 'cli']
    try {
      vi.resetModules()
      const mod = await import('../index.js')
      const lines: string[] = []
      const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        lines.push(String(line))
      })
      mod.outputRows([{ id: 'x', name: 'foo' }])
      expect(lines[0]).toBe('id\tname')
      expect(lines[1]).toBe('x\tfoo')
      spy.mockRestore()
    } finally {
      process.argv = originalArgv
    }
  })

  it('exports runTasks, runIssues, runEpics dispatchers', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runTasks).toBe('function')
    expect(typeof mod.runIssues).toBe('function')
    expect(typeof mod.runEpics).toBe('function')
  })

  it('exports runBoard, runQueue, runSync dispatchers', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runBoard).toBe('function')
    expect(typeof mod.runQueue).toBe('function')
    expect(typeof mod.runSync).toBe('function')
  })

  it('exports runTeams, runWorkflows, runAgent dispatchers', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runTeams).toBe('function')
    expect(typeof mod.runWorkflows).toBe('function')
    expect(typeof mod.runAgent).toBe('function')
  })

  it('exports runAction dispatcher', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runAction).toBe('function')
  })

  it('optArg returns the value after a flag, or undefined', async () => {
    const originalArgv = process.argv
    process.argv = ['node', 'cli', '--foo', 'bar']
    try {
      vi.resetModules()
      const mod = await import('../index.js')
      expect(mod.optArg('--foo')).toBe('bar')
      expect(mod.optArg('--missing')).toBeUndefined()
    } finally {
      process.argv = originalArgv
    }
  })

  it('requireArg exits when flag is missing', async () => {
    const originalArgv = process.argv
    process.argv = ['node', 'cli']
    try {
      vi.resetModules()
      const mod = await import('../index.js')
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`EXIT ${code ?? 0}`)
      }) as never)
      expect(() => mod.requireArg('--missing')).toThrow(/EXIT 1/)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
      exitSpy.mockRestore()
    } finally {
      process.argv = originalArgv
    }
  })
})
