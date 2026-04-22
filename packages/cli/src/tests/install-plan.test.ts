import { describe, expect, it } from 'vitest'
import { summarizeAdaptiveInstallPlan } from '../integration-plan.js'

describe('summarizeAdaptiveInstallPlan', () => {
  it('returns cli-only when no runtimes are detected', () => {
    const plan = summarizeAdaptiveInstallPlan({
      cwd: '/tmp/project',
      home: '/tmp/home',
      exists: () => false,
      commandExists: () => false,
    })

    expect(plan.recommendedPath).toBe('cli-only')
    expect(plan.detectedRuntimes).toEqual([])
  })

  it('returns adaptive and marks detected runtimes with agent-specific paths', () => {
    const plan = summarizeAdaptiveInstallPlan({
      cwd: '/tmp/project',
      home: '/tmp/home',
      exists: (path) => path.endsWith('/.cursor') || path.endsWith('/.codex'),
      commandExists: (command) => command === 'claude' || command === 'pi' || command === 'qwen',
    })

    expect(plan.recommendedPath).toBe('adaptive')
    expect(plan.detectedRuntimes).toEqual(expect.arrayContaining(['claude', 'qwen', 'pi', 'cursor', 'codex']))
    expect(plan.runtimes.find(runtime => runtime.runtime === 'claude')?.installPath).toBe('plugin-first')
    expect(plan.runtimes.find(runtime => runtime.runtime === 'qwen')?.installPath).toBe('extension-first')
    expect(plan.runtimes.find(runtime => runtime.runtime === 'pi')?.installPath).toBe('extension-first')
    expect(plan.runtimes.find(runtime => runtime.runtime === 'cursor')?.installPath).toBe('rules-first')
    expect(plan.runtimes.find(runtime => runtime.runtime === 'codex')?.installPath).toBe('config-first')
  })
})
