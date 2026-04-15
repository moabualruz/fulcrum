// packages/workflows/src/index.ts
// Explicit named exports — avoids wildcard `export *` so tree-shaking works
// and internal symbols don't accidentally become public API surface.

// Types
export type {
  WorkflowStepType,
  WorkflowStepDef,
  WorkflowStepState,
  WorkflowDefinition,
  WorkflowRun,
  StartWorkflowInput,
  StepWorkflowInput,
  ResumeWorkflowInput,
  CancelWorkflowInput,
  GetWorkflowRunInput,
  StepContext,
  StepResult,
  StepHandler,
  RunWorkflowInput,
  RunWorkflowResult,
} from './types.js'

// Schema migration
export { runMigration007Workflows } from './schema.js'

// Registry
export { WorkflowRegistry, registry } from './registry.js'

// Engine helpers (used by runner and tests)
export { nextReadySteps, computeStatusCategory, initStepStates } from './engine.js'

// CRUD operations
export {
  startWorkflow,
  stepWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  listWorkflows,
  getWorkflowRun,
} from './workflows.js'

// H-1/H-5: runner + step handlers
export { runWorkflow } from './runner.js'
export { executeStep, getStepHandler, listStepHandlers } from './step-executor.js'
