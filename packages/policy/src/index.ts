// packages/policy/src/index.ts
// Explicit named exports — avoids wildcard `export *` so tree-shaking works
// and internal symbols don't accidentally become public API surface.

// Types
export type { AgentRole } from '@moabualruz/fulcrum-core'
export type {
  PolicyScope,
  PolicyAction,
  MatcherType,
  PolicyMatcher,
  PolicyRule,
  EvaluatePolicyInput,
  PolicyDecision,
  SecretMatch,
  SecretScanResult,
  PolicyEvent,
  CreatePolicyRuleInput,
  ListPolicyRulesInput,
  LogPolicyEventInput,
  GetAuditLogInput,
} from './types.js'

// Secret guard
export { checkSecrets, redactSecrets } from './secret-guard.js'

// Policy engine
export { SYSTEM_INVARIANTS, evaluatePolicy, createPolicyRule, listPolicyRules } from './engine.js'

// Audit log
export { logPolicyEvent, getAuditLog } from './audit.js'
