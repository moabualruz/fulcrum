// packages/worker/src/index.ts
// Public surface of @fulcrum/worker — see types.ts for the adapter
// contract and lifecycle.ts for the driver.

export { spawnAgent } from './lifecycle.js'
export {
  registerAgentAdapter,
  getAgentAdapter,
  listAgentAdapters,
} from './adapter.js'
export { stubAdapter } from './stub.js'
export { subprocessAdapter } from './subprocess.js'
export { claudeCodeAdapter } from './adapters/claude-code.js'
export type {
  AgentAdapter,
  SpawnContext,
  SpawnAgentInput,
  WorkerResult,
} from './types.js'
