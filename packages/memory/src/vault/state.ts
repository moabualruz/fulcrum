// packages/memory/src/vault/state.ts
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface VaultStateEntry {
  id: string
  path: string       // relative path from vault root
  mtime: number      // Date.now() at write time
  sha256: string     // sha256 of file body (not including frontmatter)
}

export type VaultState = Record<string, VaultStateEntry>  // keyed by memory id

function statePath(vaultPath: string): string {
  return join(vaultPath, '.state.json')
}

export function readState(vaultPath: string): VaultState {
  const p = statePath(vaultPath)
  if (!existsSync(p)) return {}
  try {
    const raw = readFileSync(p, 'utf-8')
    return JSON.parse(raw) as VaultState
  } catch {
    return {}
  }
}

export function writeState(vaultPath: string, state: VaultState): void {
  writeFileSync(statePath(vaultPath), JSON.stringify(state, null, 2), 'utf-8')
}

export function upsertStateEntry(vaultPath: string, entry: VaultStateEntry): void {
  const state = readState(vaultPath)
  state[entry.id] = entry
  writeState(vaultPath, state)
}

export function removeStateEntry(vaultPath: string, id: string): void {
  const state = readState(vaultPath)
  delete state[id]
  writeState(vaultPath, state)
}
