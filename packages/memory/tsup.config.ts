import { defineConfig } from 'tsup'
import { builtinModules } from 'node:module'

// All node builtins — both the bare names (`fs`, `path`) and the `node:`-prefixed
// variants (`node:fs`, `node:path`). Marking them external stops rollup-plugin-dts
// (via `dts.resolve: true`) from attempting to re-bundle their named exports,
// which trips on the nested-export issue when builtins are imported with
// named-style syntax from a workspace dep.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: true, compilerOptions: { composite: false } },
  external: nodeExternals,
  clean: true,
})
