// packages/memory/src/l1/curator-backend/pi.ts
//
// Memory v3 PR 3 unit 3.3 — pi curator backend (stub).
//
// The pi CLI has a non-interactive mode (`--print --mode json`) but its
// JSON output contract is not yet stable enough to hang curator traffic
// off (plan §L0→L1 curation pipeline). This module reserves the backend
// slot so the dispatcher's fallback order stays discoverable, and the
// CLI surface (`--backend pi`) returns a clear NotImplementedError
// instead of a silent drop-through to openai. Wiring lands in a future
// PR once pi's structured-output mode stabilizes.

import type {
  CuratorBackend,
  CuratorBackendInput,
  CuratorBackendResult,
} from '../curator.js'

async function piIsAvailable(): Promise<boolean> {
  // Intentionally always false until the real backend is wired. Keeping
  // isAvailable=false means auto-select skips pi even when the `pi` binary
  // happens to be on PATH — safer than routing curator traffic through a
  // stub.
  return false
}

async function piCurate(_input: CuratorBackendInput): Promise<CuratorBackendResult> {
  throw new Error(
    'pi curator backend is a stub in memory v3 PR 3 (non-interactive mode not yet stable). Set FULCRUM_CURATOR_BACKEND=codex or FULCRUM_CURATOR_BACKEND=openai.',
  )
}

export const piBackend: CuratorBackend = {
  name: 'pi',
  isAvailable: piIsAvailable,
  curate: piCurate,
}
