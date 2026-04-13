import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks', // required: better-sqlite3 native addon is not thread-safe
  },
})
