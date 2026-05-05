# Phase 04: Inference + Router/Skills - Research

**Researched:** 2026-05-05  
**Domain:** Local inference runtime, embedding storage, routing rules, learned drafts, MCP virtual skills, skill supply chain  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Inference Runtime Contract
- **D-01:** Treat embedded Rust, Ollama, LM Studio, and OpenAI-compatible backends as equal Phase 4 runtime targets. The implementation must prove backend parity rather than making embedded the only canonical backend.
- **D-02:** `fulcrum inference status` and doctor should report typed degraded states for configured unavailable backends, including reason. `start` starts the embedded sidecar only; external backends are probed, not launched.
- **D-03:** INF-02 requires a full cross-build gate: automated macOS and Linux static build proof must exist before Phase 4 closes.
- **D-04:** Embedded fastembed real calls are mandatory. Any backend configured/enabled for Phase 4 must pass real embed/generate calls before completion; unconfigured optional backends are not required.

### Embedding Schema + Model Dimensions
- **D-05:** Perform the embedding dimension migration globally in Phase 4. Update every `vector(1536)` schema/spec/code reference to the configured embedding dimension; default fastembed target is `vector(384)`.
- **D-06:** Vector storage dimension is derived from configured embedding model metadata, not from a hard-coded abstract constant. Default fastembed uses 384 dimensions. Non-384 models must fail configuration validation unless schema/storage explicitly supports that dimension.
- **D-07:** If embedding model dimension changes, fail closed until a migration/reindex plan exists. Do not allow silent mixed-dimension data.
- **D-08:** Acceptance proof must include schema + round-trip + search proof: migration/entity/spec agree, embed writes correct dimensions, and retrieval/search reads the same vector without coercion.

### Router Learning Behavior
- **D-09:** No-match learned routing rules are stored as disabled draft/review-needed rules first. They are not active until promoted.
- **D-10:** Learned draft rules must store full decision evidence: task facts, no-match reason, proposed conditions/actions, source, confidence, and model/backend when LLM is involved.
- **D-11:** Web, CLI, and TUI must all be able to approve, activate, and delete learned drafts in Phase 4.
- **D-12:** If a learned draft overlaps existing active rules, mark it with explicit `conflict` state, keep it disabled, show matching active rule IDs, and require edit/delete.

### LLM Routing Gate
- **D-13:** When `router-llm` is enabled, LLM fallback can recommend routes and create disabled draft rules with evidence. It must not directly activate rules.
- **D-14:** Low confidence must abstain and record evidence instead of forcing a route.
- **D-15:** LLM routing input scope is configurable. Default is full context bundle. Task-facts-only and task-plus-recent-routing-history modes are selectable and managed in interfaces.
- **D-16:** Privacy/security guardrails for full-context routing are configurable and manageable in all interfaces; default remains full context in all states. Preserve existing secret-handling guarantees from the context assembler; do not add a hard restriction unless configured.

### MCP as Virtual Skills
- **D-17:** MCP servers appear as first-class virtual skills in the same skill registry/search/surfaces, with source type `mcp` and capability metadata.
- **D-18:** Virtual MCP skills are discoverable descriptors only. They describe server/tools/capabilities; actual invocation remains through the agent/MCP runtime.
- **D-19:** MCP virtual skills are pinned by registry descriptor: server name, command/package/version/env hints, and tool manifest hash when available.
- **D-20:** MCP virtual skills are globally visible in skill surfaces without per-agent support details.

### Skill Sync + Lock Policy
- **D-21:** `skills.lock.json` SHA mismatch fails closed for that skill and surfaces exact expected/actual SHA.
- **D-22:** Upstream skill sync auto-merges safe diffs when the local file is unmodified. Local edits create conflicts requiring review.
- **D-23:** Conflicts produce structured three-way conflict artifacts with local/upstream/base hashes and suggested resolution. Do not write inline conflict markers into `SKILL.md`.
- **D-24:** Web, CLI, and TUI can override conflicts and lock mismatches, with audit record.

### Three-Surface Routing UX
- **D-25:** Routing config has full CRUD parity in Phase 4: Web, CLI, and TUI can list, test, create, update, and delete routing rules and learned drafts.
- **D-26:** Route tests return explainable results: matched rule/draft, facts used, confidence, backend if LLM, and why unmatched.
- **D-27:** Rule authoring uses structured builders in interfaces with a raw JSON escape hatch for advanced users.
- **D-28:** Rule saves require strict validation plus dry-run support. Invalid JSON/conditions are rejected; users can dry-run against sample tasks before save.

### the agent's Discretion
- Planner may choose exact service/repository boundaries, but must preserve Phase 1 architecture: surfaces call tRPC/shared services, services call MikroORM repositories, and no new raw SQL app paths.
- Planner may choose exact config names for routing input modes, confidence thresholds, backend health states, and lock override commands, provided all decisions above remain true.
- Planner may decide how to implement cross-platform static build proof locally versus CI scripts, provided macOS and Linux proof is automated and repeatable.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 4 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INF-01 | 384-dim fastembed vectors stored in `vector(384)` columns; all `vector(1536)` references updated. [VERIFIED: .planning/REQUIREMENTS.md] | Use model metadata validation plus schema/code scan gates; current code still has non-vector embedding stores that need migration inventory. [VERIFIED: rg embedding/vector] |
| INF-02 | Static binary build pipeline verified on macOS and Linux. [VERIFIED: .planning/REQUIREMENTS.md] | Add repeatable host + Linux cross-build proof; local `cross` and Docker are missing now, so planner needs install/fallback step. [VERIFIED: command probes] |
| INF-03 | `fulcrum inference start/stop/status` functional. [VERIFIED: .planning/REQUIREMENTS.md] | CLI exists but status shape must expand to typed per-backend degraded states. [VERIFIED: src/cli/inference.ts, src/inference/protocol.ts] |
| INF-04 | Doctor shows sidecar status. [VERIFIED: .planning/REQUIREMENTS.md] | Existing routing doctor checks sidecar reachability; Phase 4 needs inference doctor parity and real-call state. [VERIFIED: src/doctor/checks/routing.ts] |
| INF-05 | All configured inference backends tested with real model calls. [VERIFIED: .planning/REQUIREMENTS.md] | Backend interface exists for embedded/Ollama/LM Studio/OpenAI-compatible; contract tests must run embed + generate for configured/enabled backends. [VERIFIED: src/inference/backends/*] |
| INF-06 | Embedding round-trip cosine >= 0.9 for paraphrase pair. [VERIFIED: .planning/REQUIREMENTS.md] | Use real fastembed path, not `SKIP_MODEL_DOWNLOAD=1`, then write/read/search through product store. [VERIFIED: inference/inference-embed/src/lib.rs] |
| INF-07 | Auto-spawn triggered by first flag caller verified. [VERIFIED: .planning/REQUIREMENTS.md] | Add integration around first embeddings/router caller starting embedded only; external backends are probed only. [VERIFIED: 04-CONTEXT.md] |
| RTR-01 | Rules-engine routes matching task in unit test. [VERIFIED: .planning/REQUIREMENTS.md] | `json-rules-engine` already owns deterministic matching; extend output evidence. [VERIFIED: src/router/rules-engine.ts] |
| RTR-02 | No-match path stores learned rule in DB. [VERIFIED: .planning/REQUIREMENTS.md] | Current path learns active rule; replace with disabled draft/evidence/conflict model. [VERIFIED: src/router/auto-assign.ts, src/db/entities/router/RoutingRule.ts] |
| RTR-03 | LLM routing gate off by default, functional when enabled. [VERIFIED: .planning/REQUIREMENTS.md] | Existing env-gated fallback returns route directly; revise to recommend/abstain/draft only. [VERIFIED: src/router/llm-fallback.ts] |
| RTR-04 | Upstream skill sync diffs and auto-merges. [VERIFIED: .planning/REQUIREMENTS.md] | Existing sync auto-writes clean installs; replace diff-in-lock conflicts with structured artifact records. [VERIFIED: src/skills/upstream-sync.ts] |
| RTR-05 | MCP servers available as virtual skills. [VERIFIED: .planning/REQUIREMENTS.md] | Built-in MCP catalog exists; map descriptors into skill registry with `source=mcp`. [VERIFIED: src/cli/mcp-builtins.ts, src/components/catalog.ts] |
| RTR-06 | Web routing rules editor functional. [VERIFIED: .planning/REQUIREMENTS.md] | Existing Web route editor supports CRUD/dry-run basics; add learned drafts, explainable tests, structured builder, raw JSON escape hatch. [VERIFIED: src/web/src/routes/settings/routing/*] |
| RTR-07 | `skills.lock.json` SHA-256 pins validated on install. [VERIFIED: .planning/REQUIREMENTS.md] | Existing install asserts hashes but error lacks expected/actual and fail-closed listing state. [VERIFIED: src/skills/loader.ts, src/skills/lock.ts] |
| RTR-08 | Web, CLI, TUI show routing config. [VERIFIED: .planning/REQUIREMENTS.md] | Web/TUI surfaces exist; CLI help advertises routing but dedicated implementation must be verified/wired. [VERIFIED: src/tui/screens/routing-rules.ts, src/cli/index.ts] |
</phase_requirements>

## Summary

Phase 4 should be planned as hardening existing seams, not greenfield construction. Inference, routing, skill lock/sync, MCP registry, Web routing, and TUI routing already exist, but current semantics are weaker than the locked decisions: learned rules can become active, route results lack full evidence, embedding storage is inconsistent across `vector(384)`, `real[]`, text, and JSON, and lock conflicts are stored as diffs in `skills.lock.json` rather than structured review artifacts. [VERIFIED: codebase rg + targeted file reads]

Primary recommendation: create shared services for inference health/model metadata, routing decisions/drafts, and skill registry/lock state; keep Web/CLI/TUI as thin tRPC callers; use LangGraph only inside router service if it removes meaningful state-machine code, with MikroORM/audit rows remaining source of truth. [VERIFIED: 04-CONTEXT.md] [CITED: Context7 LangGraph docs]

## Project Constraints (from AGENTS.md)

- Use `bun run ci` as root gate; use focused `bun test` suites while iterating. [VERIFIED: AGENTS.md, package.json]
- Keep Phase 4 on `dev/v1.0`; do not mutate `main` during phase work. [VERIFIED: .planning/STATE.md]
- Preserve tRPC → service → MikroORM repository layering; no new raw SQL app paths. [VERIFIED: AGENTS.md, 04-CONTEXT.md]
- Use feature flags through `FULCRUM_FEATURES` / registry for optional behavior. [VERIFIED: AGENTS.md, src/flags/registry.ts]
- Do not add GitHub Actions as source of truth; local gates are canonical. [VERIFIED: AGENTS.md]
- Skills remain one tool per skill; MCP virtual skills are descriptors, not invocation wrappers. [VERIFIED: AGENTS.md, 04-CONTEXT.md]
- For project-management, docs, memory, and context surfaces, avoid new embeddings/RAG/model dependencies unless explicitly approved; Phase 4 has explicit approval only for inference/router/skills scope. [VERIFIED: AGENTS.md, 04-CONTEXT.md]
- Prefer reuse/open-source building blocks that cover roughly 75%+ when license/runtime risk is acceptable. [VERIFIED: AGENTS.md]
- Use `rg`, `fd`, `bat`, `jq`, `yq`, `just`, `mise`, `ctx7` patterns from Fulcrum rules where applicable. [VERIFIED: AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Inference sidecar lifecycle | API / Backend | OS process | Backend owns start/stop/status and model probes; OS owns process/socket state. [VERIFIED: src/inference/lifecycle.ts, src/cli/inference.ts] |
| External backend health | API / Backend | External services | Backend probes Ollama/LM Studio/OpenAI-compatible; Fulcrum must not launch external providers. [VERIFIED: 04-CONTEXT.md] |
| Embedding dimension validation | API / Backend | Database / Storage | Service validates model metadata before write/search; DB enforces `vector(384)` where pgvector is used. [VERIFIED: 04-CONTEXT.md] [CITED: pgvector docs] |
| Routing decision | API / Backend | Inference backend | Deterministic rules run first; LLM fallback only recommends/abstains/drafts. [VERIFIED: src/router/rules-engine.ts, 04-CONTEXT.md] |
| Learned draft lifecycle | API / Backend | Database / Storage | Approval/delete/conflict state must persist and audit across all surfaces. [VERIFIED: 04-CONTEXT.md] |
| Routing editor UX | Browser / Client | API / Backend | UI builds forms/raw JSON and shows evidence; validation/dry-run/save belong to shared backend service. [VERIFIED: src/web/src/routes/settings/routing/*] |
| MCP virtual skills | API / Backend | Agent/MCP runtime | Fulcrum indexes descriptors; actual tool calls remain agent/MCP runtime. [VERIFIED: 04-CONTEXT.md] [CITED: MCP tools spec] |
| Skill lock enforcement | API / Backend | Filesystem | Backend computes SHA and marks availability; filesystem stores installed `SKILL.md`. [VERIFIED: src/skills/loader.ts, src/skills/lock.ts] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun` | 1.3.13 | Runtime/test/package runner. [VERIFIED: `bun --version`] | Project scripts and CI use Bun. [VERIFIED: package.json] |
| `typescript` | root `^5.6.0`; web `^6.0.2` | Type checking. [VERIFIED: package.json, src/web/package.json] | Existing repo standard; do not introduce parallel JS toolchain. [VERIFIED: package.json] |
| `zod` | 4.4.2 | Runtime schemas for tRPC, inference protocol, routing outputs. [VERIFIED: package.json] | Existing backend validation library; AI-SPEC structured-output examples use Zod. [VERIFIED: 04-AI-SPEC.md] |
| `json-rules-engine` | 7.3.1, npm modified 2025-02-20 | Deterministic routing rules. [VERIFIED: npm registry, src/router/rules-engine.ts] | Existing rules engine; supports rule conditions/events already wired. [VERIFIED: code] |
| `@langchain/langgraph` | 1.2.9, npm modified 2026-04-16 | Optional internal router state graph. [VERIFIED: npm registry] | AI-SPEC-selected framework; use only inside router service when it reduces state-machine complexity. [VERIFIED: 04-AI-SPEC.md] |
| `@langchain/core` | 1.1.44, npm modified 2026-05-02 | LangGraph/LangChain core abstractions. [VERIFIED: npm registry] | Required peer/core for LangGraph integration. [VERIFIED: npm registry] |
| `fastembed` Rust crate | repo `^4`; crates.io latest 5.13.4 | Embedded local embeddings. [VERIFIED: inference/inference-embed/Cargo.toml, crates.io search] | Existing embedded sidecar uses fastembed and default 384-dim `BAAI/bge-small-en-v1.5`. [VERIFIED: inference/inference-embed/src/lib.rs] |
| `pgvector` | docs 0.8.1/0.8.2 | PostgreSQL vector type/indexes. [CITED: CrunchyData pgvector docs] | Native `vector(384)` storage and HNSW/cosine indexing are required by INF-01. [VERIFIED: .planning/REQUIREMENTS.md] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@langchain/ollama` | 1.2.7, npm modified 2026-04-27 | Optional adapter for Ollama chat/model calls. [VERIFIED: npm registry] | Use only if it preserves Fulcrum health/probe evidence and timeout semantics. [VERIFIED: 04-AI-SPEC.md] |
| `@langchain/openai` | 1.4.5, npm modified 2026-04-27 | Optional OpenAI-compatible adapter path. [VERIFIED: npm registry] | Use for OpenAI-compatible router LLM calls if wrapper preserves backend parity and local-first config. [VERIFIED: 04-AI-SPEC.md] |
| `@modelcontextprotocol/sdk` | 1.29.0, npm modified 2026-03-30 | MCP client descriptor discovery. [VERIFIED: npm registry] | Use only for descriptor/tool manifest harvesting; no direct invocation in Fulcrum surfaces. [VERIFIED: 04-CONTEXT.md] |
| `promptfoo` | 0.121.9, npm modified 2026-04-27 | Prompt/schema regression evals. [VERIFIED: npm registry] | Use for router LLM fallback eval corpus if LangGraph/LLM path lands. [VERIFIED: 04-AI-SPEC.md] |
| `@opentelemetry/api` | 1.9.1, npm modified 2026-05-01 | Optional spans. [VERIFIED: npm registry] | Optional Phoenix/local traces; audit rows remain required. [VERIFIED: 04-AI-SPEC.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `json-rules-engine` | Custom condition evaluator | Do not hand-roll; current library already validates/evaluates conditions and has tests. [VERIFIED: src/router/rules-engine.ts] |
| LangGraph runtime | Plain service functions | Plain service functions are acceptable if graph adds no measurable simplification; AI-SPEC makes LangGraph internal/optional by boundary. [VERIFIED: 04-AI-SPEC.md] |
| MCP SDK client | Parse MCP registry TOML only | Registry-only descriptors miss live `tools/list` manifests and hashes; SDK supports paginated `listTools`. [CITED: Context7 MCP SDK docs] |
| Promptfoo/Phoenix | Hand-written prompt snapshots only | Manual snapshots miss schema/LLM drift; still keep deterministic gates as code tests. [VERIFIED: 04-AI-SPEC.md] |

**Installation:**
```bash
bun add @langchain/langgraph @langchain/core
bun add @modelcontextprotocol/sdk
bun add -d promptfoo @opentelemetry/api @opentelemetry/sdk-trace-node
```

Install provider adapters only when used:
```bash
bun add @langchain/ollama @langchain/openai
```

## Architecture Patterns

### System Architecture Diagram

```text
Web / CLI / TUI
  -> tRPC routers: inference, routing, skills
    -> Services
      -> InferenceService
        -> backend registry
          -> embedded Rust sidecar start/stop/probe
          -> Ollama probe/embed/generate
          -> LM Studio probe/embed/generate
          -> OpenAI-compatible probe/embed/generate
        -> typed health/degraded state
      -> EmbeddingService
        -> model metadata dimension check
        -> vector write/read/search
        -> fail-closed migration/reindex state
      -> RoutingService
        -> deterministic json-rules-engine match
        -> no-match evidence
        -> optional router-llm gate
          -> structured output parse/retry
          -> recommend / abstain / disabled draft
        -> conflict detector
        -> audit/event persistence
      -> SkillRegistryService
        -> local/upstream skills
        -> skills.lock SHA check
        -> structured conflict artifacts
        -> MCP descriptor virtual skills
    -> MikroORM repositories
      -> routing_rules + learned draft/conflict/audit tables
      -> skill/version/lock/conflict rows
      -> inference model/cache/provider rows
      -> vector storage
```

### Recommended Project Structure

```text
src/inference/
├── service.ts                 # backend parity, lifecycle, typed health
├── model-metadata.ts          # model -> dimension/kind validation
├── backend-probes.ts          # real embed/generate probe contracts
└── backends/                  # existing embedded/ollama/lm-studio/openai-compatible

src/router/
├── service.ts                 # tRPC-facing route/test/draft APIs
├── decision-schema.ts         # explainable output and evidence schemas
├── learned-drafts.ts          # disabled draft/conflict lifecycle
├── conflict-detector.ts       # overlap with active rules
├── graph.ts                   # optional LangGraph internal state graph
└── eval-fixtures/             # 20 labeled Phase 4 examples

src/skills/
├── registry-service.ts        # local/upstream/mcp skill listing
├── mcp-virtual-skills.ts      # descriptor + tool manifest hash extraction
├── lock.ts                    # expected/actual SHA validation
└── upstream-sync.ts           # safe merge + structured conflicts
```

### Pattern 1: Typed Backend Health
**What:** Return one typed record per configured backend: backend id, configured/enabled, status, reason, model, real embed result, real generate result. [VERIFIED: 04-CONTEXT.md]  
**When to use:** `fulcrum inference status`, doctor, Web inference status, TUI inference status. [VERIFIED: 04-CONTEXT.md]  
**Example:**
```ts
const BackendHealth = z.object({
  backend: z.enum(["embedded", "ollama", "lm-studio", "openai-compatible"]),
  configured: z.boolean(),
  status: z.enum(["running", "stopped", "degraded", "unavailable"]),
  reason: z.string().nullable(),
  model: z.string().nullable(),
  embedProbe: z.object({ ok: z.boolean(), dimensions: z.number().int().nullable() }),
  generateProbe: z.object({ ok: z.boolean(), tokens: z.number().int().nullable() }),
});
```

### Pattern 2: Dimension-Safe Embedding Writes
**What:** Validate vector length against configured model metadata before persistence and before query. [VERIFIED: 04-CONTEXT.md]  
**When to use:** every embedding write/read/search path. [VERIFIED: rg embedding]  
**Example:**
```ts
export function assertEmbeddingDimension(vector: readonly number[], expected: number): void {
  if (vector.length !== expected) {
    throw new Error(`embedding dimension mismatch expected=${expected} actual=${vector.length}`);
  }
}
```

### Pattern 3: Disabled Draft Rule Creation
**What:** Store no-match learning as `review_needed` or `conflict` draft, never active `enabled=true`. [VERIFIED: 04-CONTEXT.md]  
**When to use:** no deterministic match, LLM draft recommendation, or interactive learning path. [VERIFIED: src/router/auto-assign.ts]  
**Example:**
```ts
const LearnedDraft = z.object({
  status: z.enum(["review_needed", "conflict"]),
  enabled: z.literal(false),
  taskFacts: z.record(z.string(), z.unknown()),
  noMatchReason: z.string(),
  proposedConditions: z.record(z.string(), z.unknown()),
  proposedActions: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  backend: z.string().nullable(),
  conflictingRuleIds: z.array(z.string()),
});
```

### Pattern 4: MCP Descriptor Virtual Skill
**What:** Create searchable skill rows from MCP server descriptor + tool manifest, with source `mcp` and descriptor hash. [VERIFIED: 04-CONTEXT.md]  
**When to use:** skill list/search surfaces and lock validation. [VERIFIED: src/cli/mcp-builtins.ts]  
**Example:**
```ts
const McpVirtualSkill = z.object({
  source: z.literal("mcp"),
  slug: z.string(),
  serverName: z.string(),
  commandOrUrl: z.string(),
  toolNames: z.array(z.string()),
  descriptorSha256: z.string(),
  invokableByFulcrum: z.literal(false),
});
```

### Anti-Patterns to Avoid

- **Activating learned rules on creation:** violates D-09 and hides operator review. [VERIFIED: 04-CONTEXT.md]
- **Treating config as backend health:** status must be based on real probe results. [VERIFIED: 04-CONTEXT.md]
- **Padding/truncating embeddings:** silently corrupts retrieval; fail closed instead. [VERIFIED: 04-CONTEXT.md]
- **Inline conflict markers in `SKILL.md`:** D-23 requires structured conflict artifacts. [VERIFIED: 04-CONTEXT.md]
- **Calling MCP tools from skill surfaces:** D-18 keeps invocation in agent/MCP runtime. [VERIFIED: 04-CONTEXT.md]
- **Provider-specific logic in Web/CLI/TUI:** surfaces must call shared tRPC/service behavior. [VERIFIED: AGENTS.md, 04-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Routing condition evaluation | Custom JSON condition matcher | `json-rules-engine` | Existing tests and engine cover nested condition semantics. [VERIFIED: src/router/rules-engine.ts] |
| Router state branching if complex | Ad hoc graph interpreter | Optional `@langchain/langgraph` | StateGraph supports nodes, edges, conditional flow, persistence hooks. [CITED: Context7 LangGraph docs] |
| MCP tool discovery protocol | Raw JSON-RPC parser | `@modelcontextprotocol/sdk` | SDK supports `listTools` pagination and typed clients. [CITED: Context7 MCP SDK docs] |
| Vector similarity DB primitives | JSON/text arrays as final store | pgvector `vector(384)` + HNSW/cosine | Requirement demands `vector(384)` and pgvector supports HNSW cosine indexes. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: pgvector docs] |
| Hashing/lock checks | String comparisons without algorithm metadata | SHA-256 via `node:crypto` + lock schema | Existing loader already uses SHA-256; Phase 4 needs exact expected/actual exposure. [VERIFIED: src/skills/loader.ts] |
| Prompt regression review | Manual spot checks only | Promptfoo + code-owned deterministic tests | AI-SPEC requires reference dataset and schema regression path. [VERIFIED: 04-AI-SPEC.md] |

**Key insight:** custom shortcuts in this phase create invisible authority changes: wrong route, wrong model dimension, wrong backend health, or wrong skill availability. Use existing engines/SDKs and add fail-closed service gates. [VERIFIED: 04-CONTEXT.md]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | PGlite/PostgreSQL tables can contain existing `documents.embedding`, `memories.embedding`, `search_documents.embedding`, `tasks.embedding`, `memory_embeddings`, `doc_embeddings`, routing rules, skill versions, and `skills.lock.json` hashes. [VERIFIED: rg embedding, src/db migrations, src/skills/lock.ts] | Add migrations/reindex state; fail closed on mixed/missing dimensions; preserve/upgrade skill lock rows. [VERIFIED: 04-CONTEXT.md] |
| Live service config | External backends Ollama/LM Studio/OpenAI-compatible are configured/probed, not launched. [VERIFIED: 04-CONTEXT.md] | Planner must include config probes and optional real-call skips for unconfigured backends. [VERIFIED: 04-CONTEXT.md] |
| OS-registered state | Embedded sidecar process/socket under `FULCRUM_HOME/inference.sock`; no launchd/systemd registration found. [VERIFIED: inference/inference-server/src/main.rs, rg launchd/systemd no Phase 4 hit] | Start/stop/status must clean stale socket and report PID/socket. [VERIFIED: src/cli/inference.ts] |
| Secrets/env vars | `FULCRUM_FEATURES`, provider URLs/keys, MCP auth env hints like `GITHUB_TOKEN`, `CONTEXT7_API_KEY`, `TAVILY_API_KEY`, `CLOUDFLARE_API_TOKEN`. [VERIFIED: src/flags/registry.ts, src/cli/mcp-builtins.ts] | Do not expose secrets in routing full-context input; use existing secret-handling guarantees. [VERIFIED: 04-CONTEXT.md] |
| Build artifacts | Rust target artifacts under `inference/target/`; Bun compiled binary under `dist/`; static Linux proof currently needs toolchain support not present locally. [VERIFIED: rg files, command probes] | Add repeatable build proof script and artifact metadata. [VERIFIED: 04-CONTEXT.md] |

## Common Pitfalls

### Pitfall 1: Mixed Embedding Stores
**What goes wrong:** Planner updates `vector(1536)` references but leaves text/json/real-array paths accepting arbitrary dimensions. [VERIFIED: rg embedding]  
**Why it happens:** Repo currently has multiple embedding-era implementations. [VERIFIED: src/docs/doc-embedder.ts, src/db/migrations/Migration20260502080000_inference_cache_schema.ts, src/product-kernel/db/migrations/0004_embeddings.sql]  
**How to avoid:** inventory every embedding column and write path; centralize dimension validation. [VERIFIED: 04-CONTEXT.md]  
**Warning signs:** tests only grep `vector(1536)` and do not assert write/read/search vector length. [VERIFIED: 04-CONTEXT.md]

### Pitfall 2: LLM Fallback Becomes Auto-Router
**What goes wrong:** LLM returns an agent and dispatch uses it directly. [VERIFIED: src/router/llm-fallback.ts]  
**Why it happens:** Current `RoutingDecision` shape is route-centric, not draft/evidence-centric. [VERIFIED: src/router/types.ts, src/server/trpc/routers/routing.ts]  
**How to avoid:** route outputs must include `matched|recommended|abstained|draft_created|conflict`, evidence, backend, and confidence. [VERIFIED: 04-AI-SPEC.md]  
**Warning signs:** no persisted evidence for low confidence or invalid structured output. [VERIFIED: src/router/llm-fallback.ts]

### Pitfall 3: MCP Descriptor Trust Leakage
**What goes wrong:** Tool descriptions are shown as trusted skill instructions or made directly invokable from Fulcrum. [CITED: MCP tools spec]  
**Why it happens:** MCP tools are model-controlled and descriptions/annotations are part of tool metadata. [CITED: MCP tools spec]  
**How to avoid:** treat virtual skills as untrusted descriptors with hashes and no direct invocation. [VERIFIED: 04-CONTEXT.md]  
**Warning signs:** UI button says "Run MCP skill" or model prompt includes descriptor text without source labeling. [ASSUMED]

### Pitfall 4: Skill Conflict Artifact Hidden in Lock File
**What goes wrong:** Conflict diff exists only as `upstream_conflict` in lock JSON, hard for Web/CLI/TUI review and override audit. [VERIFIED: src/skills/upstream-sync.ts]  
**Why it happens:** Current implementation stores unified diff in lock entry. [VERIFIED: src/skills/lock.ts]  
**How to avoid:** create structured conflict entity/artifact with base/local/upstream hashes and resolution status. [VERIFIED: 04-CONTEXT.md]  
**Warning signs:** `SKILL.md` unchanged but conflict cannot be listed or approved by all surfaces. [VERIFIED: src/server/trpc/routers/skills.ts]

### Pitfall 5: LangGraph Persistence Misused
**What goes wrong:** Graph checkpoints become product source of truth or fail because `thread_id` missing. [CITED: Context7 LangGraph docs]  
**Why it happens:** LangGraph checkpointers require configurable `thread_id`; MemorySaver is in-process. [CITED: Context7 LangGraph docs]  
**How to avoid:** use MikroORM/audit rows as durable state; pass stable `thread_id` only if checkpointer enabled. [VERIFIED: 04-AI-SPEC.md]  
**Warning signs:** tests pass with `MemorySaver` but route history disappears on restart. [CITED: Context7 LangGraph docs]

## Code Examples

### LangGraph Conditional Router Skeleton
```ts
// Source: Context7 LangGraph docs + 04-AI-SPEC.md
const graph = new StateGraph(RoutingState)
  .addNode("rules", deterministicRules)
  .addNode("llm", llmFallbackNode)
  .addNode("persist", persistDecision)
  .addEdge(START, "rules")
  .addConditionalEdges("rules", (state) => {
    if (state.decision?.status === "matched") return "persist";
    return state.routerLlmEnabled ? "llm" : "persist";
  }, { llm: "llm", persist: "persist" })
  .addEdge("llm", "persist")
  .addEdge("persist", END)
  .compile();
```

### MCP Tool Manifest Hash
```ts
// Source: Context7 MCP SDK docs
const tools: Tool[] = [];
let cursor: string | undefined;
do {
  const page = await client.listTools({ cursor });
  tools.push(...page.tools);
  cursor = page.nextCursor;
} while (cursor);

const manifestHash = createHash("sha256")
  .update(JSON.stringify(tools.map((tool) => ({
    name: tool.name,
    title: tool.title ?? null,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name))))
  .digest("hex");
```

### pgvector Cosine Index
```sql
-- Source: pgvector docs
CREATE INDEX IF NOT EXISTS doc_embeddings_hnsw
  ON doc_embeddings USING hnsw (embedding vector_cosine_ops);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ollama `/api/embeddings` | Ollama `/api/embed` | Current Ollama docs; older API superseded. [CITED: Ollama docs] | Use `/api/embed` for real embedding probes. [CITED: Ollama docs] |
| Single hard-coded embedding dimension | Model metadata-derived dimension with fail-closed schema compatibility | Phase 4 locked decision. [VERIFIED: 04-CONTEXT.md] | Planner must add config validation and reindex/migration gate. [VERIFIED: 04-CONTEXT.md] |
| Learned rule immediately active | Disabled draft/review-needed/conflict lifecycle | Phase 4 locked decision. [VERIFIED: 04-CONTEXT.md] | Planner must add draft state and promotion API. [VERIFIED: 04-CONTEXT.md] |
| MCP servers as agent config only | MCP descriptors as virtual skills | Phase 4 locked decision. [VERIFIED: 04-CONTEXT.md] | Planner must index descriptors globally but not invoke them. [VERIFIED: 04-CONTEXT.md] |

**Deprecated/outdated:**
- Direct LLM route activation is out of policy for Phase 4. [VERIFIED: 04-CONTEXT.md]
- `/api/embeddings` should not be new Ollama integration target; use `/api/embed`. [CITED: Ollama docs]
- `SKIP_MODEL_DOWNLOAD=1` deterministic embeddings cannot satisfy real-call acceptance. [VERIFIED: inference/inference-embed/src/lib.rs, 04-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UI wording like "Run MCP skill" would indicate descriptor/invocation confusion. | Common Pitfalls | Low; validation can inspect final UI copy. |

## Open Questions

1. **Linux static proof path**
   - What we know: INF-02 requires automated macOS + Linux proof; local Rust toolchain exists, but Docker/cross were not found. [VERIFIED: 04-CONTEXT.md, command probes]
   - What's unclear: whether planner should install `cross`, use a remote builder, or add a script that runs in CI-like Linux environment. [ASSUMED]
   - Recommendation: add a Wave 0 environment/toolchain task before implementation. [VERIFIED: command probes]

2. **Fastembed major upgrade**
   - What we know: repo uses `fastembed = "4"` and crates.io latest is 5.13.4. [VERIFIED: Cargo.toml, crates.io search]
   - What's unclear: whether v5 API/runtime changes are worth taking in Phase 4. [ASSUMED]
   - Recommendation: keep v4 unless real-call tests expose a blocker; do not mix upgrade with acceptance hardening. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Bun | all TS tests/build | yes | 1.3.13 | none |
| Node | Context7/npm tooling | yes | v24.15.0 | Bun for project scripts |
| Rust cargo | embedded inference build | yes | cargo 1.95.0 | none |
| rustc | embedded inference build | yes | rustc 1.95.0 | none |
| `cross` | Linux static cross-build proof | no | — | install or use Linux builder |
| Docker | likely `cross` backend / sandbox checks | no | — | Linux host build script |
| Ollama | optional configured backend real-call test | no | — | skip unless configured; document unavailable |
| `jq` | JSON parsing | yes | jq-1.7.1 | none |
| Git | upstream skill sync | yes | 2.50.1 | none |

**Missing dependencies with no fallback:**
- None for research. [VERIFIED: command probes]

**Missing dependencies with fallback:**
- `cross` / Docker for Linux proof: planner needs explicit environment task. [VERIFIED: command probes]
- Ollama for optional backend tests: skip unless configured/enabled, per D-04. [VERIFIED: 04-CONTEXT.md]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test 1.3.13; Svelte route/component tests under web; Rust cargo tests for sidecar. [VERIFIED: package.json, command probes] |
| Config file | `package.json`, `src/web/package.json`, `inference/Cargo.toml`. [VERIFIED: file reads] |
| Quick run command | `bun test src/inference src/router src/skills src/server/trpc/routers/__tests__/inference.test.ts src/server/trpc/routers/__tests__/skills.test.ts` |
| Full suite command | `bun run ci` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INF-01 | schema/entity/spec agree on 384 dimensions | unit/integration | `bun test src/db/inference-schema.test.ts src/product-kernel/db/embeddings.test.ts` | yes |
| INF-02 | macOS + Linux static binary proof | build/smoke | `bun run scripts/build-all.ts && inference/scripts/smoke.sh <binary>` | partial; Linux proof gap |
| INF-03 | inference CLI start/stop/status | CLI unit/integration | `bun test src/cli/inference.test.ts src/inference/lifecycle.test.ts` | yes |
| INF-04 | doctor sidecar status | unit | `bun test src/doctor src/cli/doctor.test.ts` | yes; needs inference-specific expansion |
| INF-05 | configured backends real embed/generate | contract/integration | `bun test src/inference/contract.test.ts src/inference/backends` | yes; real-call cases need expansion |
| INF-06 | paraphrase cosine >= 0.9 round-trip | integration | `cargo test --manifest-path inference/Cargo.toml && bun test src/inference/contract.test.ts` | partial; real fastembed round-trip gap |
| INF-07 | first flag caller auto-spawns embedded | integration | `bun test src/inference/lifecycle.test.ts src/memory src/search` | partial |
| RTR-01 | deterministic matching | unit | `bun test src/router/rules-engine.test.ts src/router/auto-assign.test.ts` | yes |
| RTR-02 | no-match disabled draft stored | service/repository | `bun test src/router src/server/trpc/routers/routing.ts` | partial; new draft tests needed |
| RTR-03 | LLM gate off/default, enabled recommend/abstain/draft | unit/eval | `bun test src/router/llm-fallback.test.ts` | partial |
| RTR-04 | upstream sync safe merge/conflict artifact | unit | `bun test src/skills/upstream-sync.ts src/cli/upstream-skills.test.ts` | yes; artifact gap |
| RTR-05 | MCP virtual skills visible descriptor-only | unit/integration | `bun test src/skills src/server/trpc/routers/__tests__/skills.test.ts src/cli/mcp.test.ts` | partial |
| RTR-06 | Web routing editor | web route/component/e2e | `cd src/web && bun test --conditions=svelte ./src/routes/settings/routing && bun run web:e2e:smoke` | yes; learned draft UX gap |
| RTR-07 | lock SHA fail-closed | unit | `bun test src/skills/loader.test.ts src/skills/lock.ts` | yes; expected/actual output gap |
| RTR-08 | Web/CLI/TUI routing config parity | CLI/TUI/Web | `bun test src/tui/screens/settings-screens.test.ts src/tui/screens/routing-rules.ts src/web/src/routes/settings/routing src/cli` | partial; CLI routing command gap |

### Sampling Rate
- **Per task commit:** focused `bun test` for touched module plus Rust tests when sidecar touched. [VERIFIED: package.json]
- **Per wave merge:** `bun run ci`. [VERIFIED: package.json]
- **Phase gate:** `bun run ci`, Rust inference smoke, and Phase 4 eval corpus. [VERIFIED: 04-AI-SPEC.md]

### Wave 0 Gaps
- [ ] `src/router/learned-drafts.test.ts` — covers RTR-02/RTR-03 disabled draft, evidence, conflict.
- [ ] `src/inference/backend-real-calls.test.ts` — covers INF-05 configured backend probes.
- [ ] `src/inference/embedding-dimension.test.ts` — covers INF-01/INF-06 model metadata + write/read/search.
- [ ] `src/skills/mcp-virtual-skills.test.ts` — covers RTR-05 descriptor-only registry.
- [ ] `src/skills/lock-enforcement.test.ts` — covers RTR-07 expected/actual fail-closed.
- [ ] `scripts/phase-04-static-build-proof.ts` — covers INF-02 platform proof.
- [ ] `evals/phase-04-router.promptfooconfig.yaml` — covers AI-SPEC LLM fallback evals.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no new auth | Existing tRPC permissioned procedures. [VERIFIED: src/server/trpc/routers/routing.ts, skills.ts] |
| V3 Session Management | no new sessions | Reuse existing Web session/tRPC auth. [VERIFIED: AGENTS.md] |
| V4 Access Control | yes | Every routing/skills/inference mutation through permissioned tRPC/service. [VERIFIED: src/server/trpc/routers/routing.ts, skills.ts] |
| V5 Input Validation | yes | Zod schemas for tRPC, routing outputs, skill descriptors, model metadata. [VERIFIED: package.json, code] |
| V6 Cryptography | yes | SHA-256 via `node:crypto` for skill/MCP descriptor locks; do not invent hash format. [VERIFIED: src/skills/loader.ts] |

### Known Threat Patterns for Phase 4 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Skill lock tampering | Tampering | Fail closed per skill with expected/actual SHA and audit override. [VERIFIED: 04-CONTEXT.md] |
| MCP tool poisoning/descriptor injection | Spoofing/Tampering | Descriptor-only virtual skills, source labels, hashes, no direct invocation. [VERIFIED: 04-CONTEXT.md] [CITED: MCP tools spec] |
| Prompt injection through full-context routing | Information Disclosure/Elevation | Preserve context assembler secret handling; configurable guardrails; abstain when required facts lost. [VERIFIED: 04-CONTEXT.md, 04-AI-SPEC.md] |
| Vector dimension drift | Tampering/DoS | Model metadata validation, `vector(384)` schema, fail-closed migration/reindex. [VERIFIED: 04-CONTEXT.md] |
| Backend health spoofing | Spoofing | Real embed/generate probes for configured backends; typed degraded states. [VERIFIED: 04-CONTEXT.md] |
| Raw JSON route injection | Tampering | Validate conditions with `json-rules-engine`, dry-run before save, no partial persistence. [VERIFIED: src/server/trpc/routers/routing.ts] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/04-inference-router-skills/04-CONTEXT.md` — locked decisions D-01..D-28. [VERIFIED: file read]
- `.planning/phases/04-inference-router-skills/04-AI-SPEC.md` — LangGraph boundary, eval strategy, guardrails. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` — INF-01..07 and RTR-01..08. [VERIFIED: file read]
- `.planning/STATE.md` — branch and architecture history. [VERIFIED: file read]
- `AGENTS.md`, `package.json`, `src/web/package.json`, `justfile` — project commands and constraints. [VERIFIED: file read]
- Code reads: `src/inference/*`, `inference/*`, `src/router/*`, `src/skills/*`, `src/server/trpc/routers/{routing,skills,inference}.ts`, `src/tui/screens/routing-rules.ts`, `src/web/src/routes/settings/routing/*`. [VERIFIED: file reads]
- Context7 LangGraph docs `/websites/langchain_oss_javascript_langgraph` — StateGraph, MemorySaver, persistence, `thread_id`. [CITED: https://docs.langchain.com/oss/javascript/langgraph/persistence]
- Context7 MCP TypeScript SDK docs `/modelcontextprotocol/typescript-sdk` — `listTools`, pagination, `registerTool`. [CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md]
- MCP Tools specification 2025-06-18 — tools/list, metadata, human-in-loop guidance. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/server/tools]
- Ollama embeddings docs — `/api/embed`, dimensions vary by model, vectors L2-normalized. [CITED: https://docs.ollama.com/capabilities/embeddings]
- pgvector docs 0.8.1/0.8.2 — HNSW cosine ops, vector dimensions, dimension checks. [CITED: https://access.crunchydata.com/documentation/pgvector/0.8.1/pdf/pgvector.pdf]
- npm registry: `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, `@langchain/ollama`, `@modelcontextprotocol/sdk`, `json-rules-engine`, `promptfoo`, OpenTelemetry packages. [VERIFIED: npm view]
- crates.io search: `fastembed` latest 5.13.4; repo uses major 4. [VERIFIED: cargo search, Cargo.toml]

### Secondary (MEDIUM confidence)
- Web search result freshness for official docs crawl dates. [VERIFIED: web search]

### Tertiary (LOW confidence)
- None used for implementation recommendations.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry, crates.io, local package manifests. [VERIFIED: npm view, cargo search, package files]
- Architecture: HIGH — based on locked CONTEXT, AI-SPEC, and existing code seams. [VERIFIED: file reads]
- Pitfalls: HIGH — current code gaps directly observed, with one UI-copy assumption marked. [VERIFIED: code reads]

**Research date:** 2026-05-05  
**Valid until:** 2026-05-12 for package versions and fast-moving AI/MCP docs; 2026-06-04 for local architecture findings.
