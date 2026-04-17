// packages/memory/src/setup/activate.ts
// Implements: fulcrum memory accelerate
// Re-enables or upgrades L2 on an existing vault by re-indexing all memories.

import { rebuildFromVault, type RebuildResult } from './rebuild.js'
import { getVaultPath, vaultExists } from '../vault/client.js'
import { FulcrumError } from 'fulcrum-core'

export async function activateL2(): Promise<RebuildResult> {
  const vaultPath = getVaultPath()
  if (!vaultExists(vaultPath)) {
    throw new FulcrumError(
      'Vault not initialised. Run `fulcrum memory init` first.',
      'not_found'
    )
  }
  return rebuildFromVault({ vaultPath, target: 'l2' })
}
