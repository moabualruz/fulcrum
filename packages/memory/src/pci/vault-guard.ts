// Vault-owned path guard. Extracted from pci/singleton.ts so the daemon
// registry, the lifecycle wrappers, and any future consumer can all share a
// single source of truth — and so lock.ts + singleton.ts can be deleted in
// the next commit without breaking those imports.

import { resolve, join } from 'node:path'
import { globalDataDir } from 'fulcrum-agent-core'

/**
 * True when `p` is the vault root at `globalDataDir()/memory` or any path
 * beneath it. The vault watcher owns that subtree; the PCI chokidar refuses
 * to attach so neither side double-emits change events.
 */
export function isVaultOwnedPath(p: string): boolean {
  const abs = resolve(p)
  const vaultPrefix = resolve(join(globalDataDir(), 'memory'))
  return abs === vaultPrefix || abs.startsWith(vaultPrefix + '/')
}

export class VaultOwnedPathError extends Error {
  constructor(path: string) {
    super(`PCI refused to attach to vault-owned path: ${path}`)
    this.name = 'VaultOwnedPathError'
  }
}
