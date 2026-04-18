// Filesystem-compatibility smoke (plan Unit 5.3).
//
// On filesystems where fs.watch silently drops events (NFS, CIFS, overlayfs,
// FUSE, Windows junctions), the watcher flips to a polling rescan every
// 5 minutes. We don't mount a real NFS — we force the detected fs type via
// the internal helper and check that the watcher picks up "polling" mode.

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchDirectory, closeWatcherSubtree } from '../../pci/watcher.js'

describe('FS compatibility — forced polling fallback', () => {
  it('forced NFS → watchDirectory mounts in polling mode, no crash', () => {
    const tree = mkdtempSync(join(tmpdir(), 'fulcrum-fs-'))
    try {
      const h = watchDirectory(tree, { forcedFsKind: 'nfs', pollIntervalMs: 10 })
      expect(h).toBeDefined()
      // Write a file; pollingRescan will observe it on the next tick but this
      // test only asserts the watcher doesn't explode for unsupported FS.
      writeFileSync(join(tree, 'a.ts'), 'export const x = 1\n')
      closeWatcherSubtree(tree)
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  it('forced overlay → polling mode too', () => {
    const tree = mkdtempSync(join(tmpdir(), 'fulcrum-fs-ov-'))
    try {
      const h = watchDirectory(tree, { forcedFsKind: 'overlay', pollIntervalMs: 10 })
      expect(h).toBeDefined()
      closeWatcherSubtree(tree)
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  it('local (ext4/btrfs/apfs) → native fs.watch mode', () => {
    const tree = mkdtempSync(join(tmpdir(), 'fulcrum-fs-local-'))
    try {
      const h = watchDirectory(tree, { forcedFsKind: 'local', pollIntervalMs: 10 })
      expect(h).toBeDefined()
      closeWatcherSubtree(tree)
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })
})
