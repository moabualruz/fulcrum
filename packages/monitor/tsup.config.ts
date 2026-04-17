import { defineConfig } from 'tsup'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: true, compilerOptions: { composite: false, skipLibCheck: true } },
  clean: true,
  async onSuccess() {
    const src = resolve('src/public')
    const dst = resolve('dist/public')
    if (existsSync(src)) cpSync(src, dst, { recursive: true })
  },
})
