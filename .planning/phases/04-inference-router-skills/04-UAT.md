# Phase 04 — Inference Router Skills: UAT

status: complete
verification_method: automated (bun test + vitest)

---

## UAT-04-01: Embedding Dimension Guard

**Given** a vector of length 384 passed to `assertEmbeddingDimension(vector, 384)`
**Then** no error is thrown.

**Given** a vector of length 1536 passed to `assertEmbeddingDimension(vector, 384)`
**Then** error thrown containing "expected=384 actual=1536".

## UAT-04-02: Backend Health Probes

**Given** `probeConfiguredBackends()` is called
**Then** returns array with one entry per backend ID (embedded, ollama, lm-studio, openai-compatible), each with valid status in {running, stopped, degraded, unavailable, unconfigured}.

## UAT-04-03: InferenceService Lifecycle

**Given** `new InferenceService()`
**Then** `.probeBackends()` returns BackendHealth array; `.start()` / `.stop()` control embedded sidecar.

## UAT-04-04: Routing Test Route

**Given** a task with facts `{kind: "bug"}` and an active rule matching `task.kind == "bug"`
**Then** `testRoute()` returns `RoutingDecisionResult` with status="matched", confidence=1.0, non-empty evidence array, and factsUsed containing the matched fact.

## UAT-04-05: Conflict Detection

**Given** a proposed draft with conditions overlapping an active rule (same task.kind)
**Then** `detectConflicts()` returns the active rule's ID in its result array.

## UAT-04-06: LLM Fallback Safety

**Given** LLM returns confidence < 0.55
**Then** `llmFallback()` returns null (abstains).

**Given** LLM returns unparseable response 3 times
**Then** `llmFallback()` returns null after exhausting retries.

## UAT-04-07: Disabled Draft Creation

**Given** a no-match event triggers draft creation
**Then** `createDisabledDraft()` returns draft with `enabled=false` and status="review_needed".

**Given** `matchingActiveRuleIds` is non-empty
**Then** draft status is "conflict".

## UAT-04-08: Skill Lock Enforcement

**Given** a skill with `descriptorSha256` = X and upstream reports SHA = Y where X != Y
**Then** system fails closed with error exposing both expected and actual SHA values.

## UAT-04-09: MCP Virtual Skills

**Given** an MCP server descriptor
**Then** `McpVirtualSkill` entity stores it with deterministic SHA-256 hash, `source="mcp"`, `invokableByFulcrum=false`.

## UAT-04-10: Routing Web UI Tabs

**Given** the routing settings page renders
**Then** 5 tabs visible: Rules, Drafts, Test, LLM Gate, Evidence. Rules tab active by default.

## UAT-04-11: CLI Routing Drafts

**Given** `fulcrum routing drafts list --json`
**Then** outputs JSON array of pending drafts with status, confidence, and conflictState fields.

## UAT-04-12: TUI Routing Screen

**Given** the TUI routing screen opens
**Then** 4-tab layout (Rules/Drafts/Test/Backends) is navigable via arrow keys.

## UAT-04-13: Backend Status Dashboard

**Given** the inference web page renders with backend probes
**Then** shows status rows per backend with colored indicators; dimension mismatch banner appears when embedded reports dimensions != 384.
