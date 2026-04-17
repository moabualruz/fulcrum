// v2a PR 4 Task 17 — filesystem-type detection for the PCI watcher fallback.
//
// Native fs.watch() silently drops events on certain network / overlay
// filesystems (NFS, CIFS, FUSE, OverlayFS, Windows junctions). Detection
// here returns a coarse FsKind; the watcher uses 'polling' mode for any
// non-'native' filesystem.
//
// Defaults are tunable per v2a review F-P1-4 — the FS list isn't exhaustive,
// just the well-known unsupported ones. Add entries based on field reports.

import { statfsSync } from 'node:fs'

export type FsKind =
  | 'native'    // ext4, btrfs, xfs, zfs, apfs, hfs+ — fs.watch is reliable
  | 'nfs'
  | 'cifs'
  | 'fuse'
  | 'overlay'
  | 'unknown'

// Linux f_type magic numbers (subset). https://man7.org/linux/man-pages/man2/statfs.2.html
const LINUX_F_TYPE: Record<number, FsKind> = {
  0x6969: 'nfs',           // NFS_SUPER_MAGIC
  0xff534d42: 'cifs',      // CIFS_MAGIC_NUMBER
  0x65735546: 'fuse',      // FUSE_SUPER_MAGIC
  0x794c7630: 'overlay',   // OVERLAYFS_SUPER_MAGIC
  0xef53: 'native',        // EXT2/3/4
  0x9123683e: 'native',    // BTRFS
  0x58465342: 'native',    // XFS
  0x2fc12fc1: 'native',    // ZFS
}

export function detectFilesystem(path: string): FsKind {
  try {
    const stat = statfsSync(path) as unknown as { type?: number; f_type?: number; f_basetype?: string }
    const t = stat.type ?? stat.f_type
    if (typeof t === 'number') {
      const kind = LINUX_F_TYPE[t]
      if (kind) return kind
    }
    if (typeof stat.f_basetype === 'string') {
      const lower = stat.f_basetype.toLowerCase()
      if (lower.includes('nfs')) return 'nfs'
      if (lower.includes('smb') || lower.includes('cifs')) return 'cifs'
      if (lower.includes('fuse')) return 'fuse'
      if (lower.includes('overlay')) return 'overlay'
      if (lower.includes('apfs') || lower.includes('hfs') || lower.includes('zfs')) return 'native'
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function shouldUsePollingFallback(kind: FsKind): boolean {
  return kind === 'nfs' || kind === 'cifs' || kind === 'fuse' || kind === 'overlay'
}
