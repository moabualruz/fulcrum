// packages/monitor/src/index.ts
// Explicit named exports — avoids `export *` so tree-shaking works.

// Public types
export type {
  DailyMetrics, ProjectMetrics, AgentMetrics, BurndownPoint, BurndownData,
  Metrics, GetMetricsInput, GetBurndownInput, GetAgentMetricsInput,
  MonitorServerConfig, MonitorServer, RunReplay, ReplayRunInput,
} from './types.js'

// Schema migration
export { runMigration009 } from './schema.js'

// Metrics functions
export {
  rollupDaily,
  recordDailyMetrics,
  getMetrics,
  getBurndown,
  getAgentMetrics,
  getPerRoleMetrics,
  getMemoryMetrics,
  getForecasting,
} from './metrics.js'

// HTTP server
export { startMonitorServer } from './server.js'
