// packages/memory/src/flags.ts
//
// Memory v3 feature flags. Single source of truth so every call site
// (hook branch, recall dispatcher, CLI, MCP handler) reads the same env
// semantics — typo in one grep-scattered check would silently regress.
//
// `FULCRUM_MEMORY_V3` defaults to ON as of PR 5 cutover (unit 5.5). Set
// to `0`/`false`/`off`/`no` for one release cycle to revert to the v2a
// path. Any other value, including blank / missing / typo, is treated
// as on — operator typos must never silently downgrade recall quality.

const OFF_VALUES = new Set(['0', 'false', 'off', 'no'])

export function isMemoryV3Enabled(): boolean {
  const raw = process.env['FULCRUM_MEMORY_V3']
  if (raw === undefined || raw === '') return true
  return !OFF_VALUES.has(raw.toLowerCase())
}
