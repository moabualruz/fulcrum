// packages/cli/src/commands/memory-auto-curate-wiring.ts
//
// Memory v3 PR 8 unit 8.1 — server-process wiring for the L0 auto-curator.
//
// Long-running processes (`fulcrum serve monitor`, `fulcrum serve mcp`,
// `fulcrum serve all`) call `startMemoryAutoCurateIfEnabled()` once they
// finish booting. When FULCRUM_MEMORY_CURATE_AUTO=1 is set, this pair
// mounts the vault watcher and subscribes the auto-curator to the
// resulting ContentChangeBus events. Otherwise it's a no-op.
//
// Kept separate from `memory-curate.ts` so the handler module stays a
// pure import of the single-shot CLI entry point.

import { curateMemory } from './memory-curate.js'

export interface AutoCurateWiringOptions {
  /**
   * Test/override hook. When unset, defaults to `getVaultPath()` at call
   * time so tests that set FULCRUM_VAULT_PATH before invoking continue
   * to work.
   */
  vaultPath?: string
}

/**
 * Returns a stop() function. No-op when FULCRUM_MEMORY_CURATE_AUTO ≠ '1'.
 */
export async function startMemoryAutoCurateIfEnabled(
  opts: AutoCurateWiringOptions = {},
): Promise<() => void> {
  if (process.env['FULCRUM_MEMORY_CURATE_AUTO'] !== '1') return () => {}

  const { startVaultWatcher, startAutoCurator, getVaultPath } = await import('fulcrum-memory')
  const vaultPath = opts.vaultPath ?? getVaultPath()

  const stopWatcher = startVaultWatcher({
    vaultPath,
    onHumanEdit: async () => {},
    onHumanDelete: async () => {},
  })
  const stopAuto = startAutoCurator({
    enabled: true,
    curate: async (l0_id: string) => {
      await curateMemory({ l0_id })
    },
    onError: (err, l0_id) => {
      process.stderr.write(`[fulcrum auto-curate] ${l0_id}: ${err.message}\n`)
    },
  })

  process.stderr.write(`[fulcrum auto-curate] watching ${vaultPath}/raw for new L0 sources\n`)

  return () => {
    try { stopAuto() } catch { /* best-effort */ }
    try { stopWatcher() } catch { /* best-effort */ }
  }
}
