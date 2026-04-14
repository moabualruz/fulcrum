#!/usr/bin/env tsx
// packages/cli/src/index.ts — fulcrum CLI entry point

import { runMemoryInit } from '@fulcrum/memory'
import { activateL2 } from '@fulcrum/memory'

const [, , ...args] = process.argv
const [group, command] = args

function usage(): never {
  console.log(`
fulcrum — local-first agent control plane

USAGE
  fulcrum <group> <command> [options]

COMMANDS
  memory init          Initialize L0 vault + L1 SQLite, optionally enable L2
  memory accelerate    Enable or rebuild L2 (Kuzu graph + HNSW vector search)
  memory rebuild       Rebuild L1 from L0 vault files
  memory status        Show vault path and layer status

OPTIONS
  --vault <path>       Override vault path (default: ~/.fulcrum/vault)
  --help, -h           Show this help

EXAMPLES
  fulcrum memory init
  fulcrum memory accelerate
  FULCRUM_VAULT_PATH=/data/vault fulcrum memory init
`)
  process.exit(0)
}

async function main(): Promise<void> {
  if (!group || group === '--help' || group === '-h') usage()

  if (group === 'memory') {
    if (!command || command === '--help' || command === '-h') {
      console.log(`
fulcrum memory — memory vault commands

  init          Initialize vault (L0 + L1), optionally enable L2
  accelerate    Enable L2 graph + vector search on existing vault
  rebuild       Rebuild L1 SQLite from L0 vault files
  status        Show vault info
`)
      process.exit(0)
    }

    if (command === 'init') {
      await runMemoryInit()
      return
    }

    if (command === 'accelerate') {
      console.log('Activating L2 (Kuzu graph + HNSW vector search)...')
      try {
        const result = await activateL2()
        console.log(`✓ L2 active — indexed ${result.l2Count} memories`)
        if (result.errors.length > 0) {
          console.log(`⚠ ${result.errors.length} errors during indexing:`)
          for (const e of result.errors.slice(0, 10)) {
            console.log(`  - ${e}`)
          }
        }
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`)
        process.exit(1)
      }
      return
    }

    if (command === 'rebuild') {
      const { rebuildFromVault } = await import('@fulcrum/memory')
      const { getVaultPath } = await import('@fulcrum/memory')
      const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
      const targetArg = args.find(a => a === '--l1' || a === '--l2' || a === '--both')
      const target = targetArg === '--l2' ? 'l2' : targetArg === '--both' ? 'both' : 'l1'
      console.log(`Rebuilding ${target.toUpperCase()} from vault at ${vaultPath}...`)
      const result = await rebuildFromVault({ vaultPath, target })
      console.log(`✓ L1: ${result.l1Count} memories, L2: ${result.l2Count} memories`)
      if (result.errors.length > 0) {
        console.log(`⚠ ${result.errors.length} errors`)
        for (const e of result.errors.slice(0, 10)) console.log(`  - ${e}`)
      }
      return
    }

    if (command === 'status') {
      const { getVaultPath, vaultExists } = await import('@fulcrum/memory')
      const { readState } = await import('@fulcrum/memory')
      const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
      const exists = vaultExists(vaultPath)
      console.log(`\nFulcrum Memory Status`)
      console.log(`─────────────────────`)
      console.log(`Vault path : ${vaultPath}`)
      console.log(`L0 vault   : ${exists ? '✓ initialized' : '✗ not found — run: fulcrum memory init'}`)
      if (exists) {
        const state = readState(vaultPath)
        const count = Object.keys(state).length
        console.log(`L0 entries : ${count} memories tracked in .state.json`)
        console.log(`L1 SQLite  : ready (FTS5 full-text search)`)
        const kuzuPath = `${process.env['HOME']}/.fulcrum/kuzu`
        const { existsSync } = await import('fs')
        console.log(`L2 Kuzu    : ${existsSync(kuzuPath) ? '✓ initialized' : '○ not enabled — run: fulcrum memory accelerate'}`)
      }
      console.log('')
      return
    }

    console.error(`Unknown memory command: ${command}`)
    console.error('Run `fulcrum memory --help` for available commands.')
    process.exit(1)
  }

  console.error(`Unknown group: ${group}`)
  usage()
}

main().catch(err => {
  console.error((err as Error).message)
  process.exit(1)
})
