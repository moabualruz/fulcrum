# Agent-OS: Orchestration · Memory · Context · Skills — Tools-Fit Research

**Date:** 2026-05-01  
**Stack:** Bun + TypeScript + PGlite · Local-first default · Future SaaS path  
**Rule:** ≥75% fit = adopt + build 25% gap. Document failure gates + fallbacks.

---

## 1. Multi-Agent Orchestration Frameworks

### Comparison Table

| Name | License | Lang/Runtime | Stars (≈) | Last Release | Domain Slice | TS Fit % | Notes |
|------|---------|--------------|-----------|--------------|--------------|----------|-------|
| **Mastra** | Apache-2.0 (EE dirs: Mastra Enterprise) | TS-native / Node, Bun | 22k+ | Mar 2026 | Agents, workflows, memory backends, RAG, observability | **90%** | Born TS; Bun-compatible; built-in pg/libSQL memory; graph workflows; MCP support |
| **@inngest/agent-kit** | Apache-2.0 | TS-native | 1.5k+ | Apr 2026 | Multi-agent networks, deterministic routing, MCP tooling | **85%** | Runs inside Inngest durable functions; Network+Router+State model; pairs with pg-boss-style persistence |
| **Vercel AI SDK (v5/v6)** | Apache-2.0 | TS-native | 16k+ | Apr 2026 | Single/multi-agent loops, streaming, provider unification | **70%** | Agent class in v6 is lightweight wrapper; multi-agent handoffs still manual; no built-in routing |
| **LangGraph.js** | MIT | TS (port from Python) | 6k+ (JS repo) | Mar 2026 | Graph-state-machine agent orchestration | **60%** | Feature-lags Python port; Python LangGraph > JS; P95 latency ~2× Mastra |
| **LangChain.js** | MIT | TS (port) | 13k+ | Apr 2026 | Chain/tool/retriever primitives | **55%** | Foundational layer, not orchestration runtime; TS lags Python |
| **CrewAI** | MIT | Python only | 29k+ | Mar 2026 | Role-based multi-agent crews | **20%** | Python-only; REST wrapper possible but heavyweight; no TS SDK |
| **AutoGen (Microsoft)** | MIT | Python primary, .NET preview | 35k+ | Mar 2026 | Agent-to-agent message passing, group chat | **20%** | Python; REST API-able but no TS SDK |
| **MetaGPT** | MIT | Python | 46k+ | Mar 2026 | Software-company role simulation | **10%** | Python; opinionated toward code-gen teams; not composable |
| **Pydantic-AI** | MIT | Python | 9k+ | Mar 2026 | Type-safe Python agents | **5%** | Python only; no TS path |
| **Phidata** | Mozilla PL 2.0 | Python | 18k+ | Mar 2026 | Agent teams with knowledge + storage | **10%** | Python; Postgres-backed memory good idea to steal |
| **Swarm (OpenAI)** | MIT | Python | 18k+ | Jan 2025 (stale) | Lightweight handoffs + routines | **15%** | Educational demo; no active maintenance; superseded by OpenAI Agents API |
| **BabyAGI / AgentVerse** | MIT | Python | 20k+ / 4k+ | 2024 (stale) | Task queue agents | **5%** | Research prototypes; not production-grade |
| **Temporal (TypeScript SDK)** | MIT | TS+Go | 13k+ | Apr 2026 | Durable workflow execution | **65%** | Orchestration runtime not agent framework; heavy infra (Go server); overkill for local-first |
| **Trigger.dev v3/v4** | Apache-2.0 | TS-native | 10k+ | Apr 2026 | Durable serverless tasks, AI workflows | **80%** | Full self-host on Postgres; no run limits; v4 = AI agent runtime; good fallback |

**Winner: Mastra** — TS-native, Apache-2.0, 22k stars, Bun-compatible, built-in workflow graph, memory backends (pg/libSQL), MCP tooling, RAG module. Gap: enterprise features gated behind EE dirs (multi-tenancy, SSO). Build the 25%: multi-user tenant isolation wrapper + auto-router plugin.

**Fallback 1:** `@inngest/agent-kit` — pairs perfectly with Inngest durable runtime; deterministic routing built-in.  
**Fallback 2:** Vercel AI SDK v6 Agent class + custom orchestration layer.

---

## 2. LLM Client / Routing Layer

| Name | License | Lang | Stars | Domain | TS Fit % | Notes |
|------|---------|------|-------|--------|----------|-------|
| **Vercel AI SDK** | Apache-2.0 | TS-native | 16k+ | Unified provider API, streaming | **90%** | Single `generateText`/`streamText` API across all providers; 20M+ monthly downloads; v5 SSE streaming; pairs with any agent framework |
| **Anthropic SDK** | MIT | TS+Python | 2k+ | Direct Claude API | **85%** | First-class TS; use when Claude-only; Claude Agent SDK = superset |
| **OpenAI SDK** | MIT | TS+Python | 5k+ | Direct OpenAI API | **80%** | TS-native; use for non-Claude models; OpenAI Agents API beta for handoffs |
| **LiteLLM** | MIT | Python proxy | 17k+ | 100+ LLM unified gateway | **60%** | Python sidecar; exposes OpenAI-compatible HTTP; TS calls it via `fetch`; adds ~15ms overhead; best for routing + cost tracking at scale |
| **OpenRouter** | SaaS | HTTP API | N/A | Model marketplace + routing | **70%** | No self-host; $0.07/M tokens pass-through; good for experimentation; lock-in risk; raised $40M Jun 2025 |
| **Helicone** | Apache-2.0 | HTTP proxy | 3k+ | Observability + routing | **65%** | Self-hostable; sits between client and LLM; logs requests; not a TS SDK |

**Winner: Vercel AI SDK** for TS client. Use as provider abstraction layer inside Mastra (Mastra already uses it internally).  
**Fallback: LiteLLM proxy sidecar** for advanced routing (load balancing, cost caps, model fallback) — run as separate process, call via `xh`.

---

## 3. Agent SDKs / Integrations

| Name | License | Lang | Domain | TS Fit % | Notes |
|------|---------|------|--------|----------|-------|
| **Claude Agent SDK (TS)** | MIT | TS-native | Claude Code-like agents, file ops, sandbox | **85%** | V2 preview simplifies multi-turn; 1M context; managed infra option (beta); sandboxing; direct fit for Fulcrum CLI agents |
| **OpenAI Agents API** | MIT | TS+Python | Handoffs, guardrails, traces | **70%** | Beta; handoffs production-ready per Vercel comparison; OpenAI-locked |
| **Claude Managed Agents** | Anthropic TOS | HTTP | Managed infra agent harness | **55%** | Beta (`managed-agents-2026-04-01`); Anthropic-hosted; file/web/code tools; loses local-first property |
| **Continue.dev** | Apache-2.0 | TS | IDE agent, code context | **40%** | IDE plugin architecture; not embeddable as library |
| **Cline / Aider** | Apache-2.0 / MIT | TS / Python | Code editing agents | **30%** | CLI tools; not SDK-embeddable cleanly |
| **Goose (Block)** | Apache-2.0 | Rust | General-purpose agent | **25%** | Rust core; TS bindings thin; Block-team maintained |

**Winner: Claude Agent SDK TS v2** for Claude-based agent runs. Pair with Vercel AI SDK for provider flexibility.

---

## 4. Long-Term Memory Engines

| Name | License | Lang | Stars | Schema Pattern | Retrieval | TS Fit % | Notes |
|------|---------|------|-------|---------------|-----------|----------|-------|
| **mem0** | Apache-2.0 | Python core + JS SDK | 30k+ | Entity+relation graph + vector | Hybrid (semantic + graph edges) | **80%** | JS SDK ships; HTTP API available; `MemoryClient` class; MCP server (Jun 2025); OpenMemory Cloud for hosted; gap: Python core = sidecar for self-hosted |
| **Letta (MemGPT)** | Apache-2.0 | Python core + TS SDK | 14k+ | Block-based context memory (core/archival/recall) | Semantic search over archival store | **75%** | TS SDK exists; REST API full-featured; stateful agents as services; works with Claude Sonnet 4.5 tools; Python sidecar needed locally |
| **Zep** | Apache-2.0 (Cloud: SaaS) | Python core + `zep-js` TS client | 3k+ | Temporal knowledge graph (Graphiti) | Graph traversal + vector | **75%** | `zep-js` npm package; cloud or self-host; session-based memory with facts extraction; strong temporal reasoning |
| **Cognee** | Apache-2.0 | Python | 3k+ | ECL pipeline → knowledge graph + embeddings | Graph + vector hybrid | **40%** | Python-only SDK; MCP bridge available; REST wrap needed for TS; raised $7.5M seed |
| **LangMem** | MIT | Python | <1k | Semantic + episodic + procedural layers | Embedding similarity | **25%** | Python; LangChain ecosystem; no TS path |
| **Mastra Memory** | Apache-2.0 | TS-native | (part of Mastra) | Conversation history + semantic recall | pgvector / libSQL / Upstash | **90%** | Built into Mastra; uses pgvector for semantic; PGlite-compatible; zero extra process |
| **Pieces** | Proprietary | Electron | — | Code snippets + context | Local ML model | **10%** | Desktop app; not embeddable |

**Winner: Mastra Memory** (built-in, TS-native, pgvector-backed, PGlite-compatible).  
**Fallback 1: mem0 via HTTP** — JS SDK + `MemoryClient`; Python sidecar for local; HTTP API for SaaS path.  
**Fallback 2: Zep** — `zep-js` npm; temporal knowledge graph; strong for cross-session fact retention.

Schema patterns to implement in-house on PGlite:
- `memories(id, agent_id, project_id, content, embedding vector(1536), type, created_at, expires_at)` — per-project + global flag
- `memory_links(from_id, to_id, relation, weight)` — simple graph edges without Neo4j
- Retrieval: pgvector cosine similarity + recency decay score

---

## 5. Vector Stores

| Name | License | Lang/Mode | Stars | PGlite-compatible | TS Fit % | Notes |
|------|---------|-----------|-------|-------------------|----------|-------|
| **PGlite + pgvector** | PostgreSQL / Apache-2.0 | In-process WASM | 10k+ | YES (native) | **95%** | pgvector bundled; `<3MB` gzip; cosine/L2/IP; half-precision; HNSW index; runs in Bun process; zero infra |
| **Vectra** | MIT | TS-native file-backed | 500+ | N/A (file-based) | **80%** | Pure TS; MongoDB-style filters; sub-ms latency; file-per-index; gRPC server option; fallback for when PGlite not available (browser/edge) |
| **LanceDB** | Apache-2.0 | Rust + Node binding | 6k+ | No | **60%** | Native Node.js binding; columnar storage; fast for large indexes; overkill for local-first |
| **Chroma** | Apache-2.0 | Python core + TS client | 18k+ | No | **50%** | HTTP client in TS; Python server; good for multi-user SaaS path |
| **Qdrant** | Apache-2.0 | Rust + HTTP | 21k+ | No | **55%** | Docker deployment; gRPC/HTTP; best performance at scale; SaaS tier |
| **Weaviate** | BSD-3 | Go + HTTP | 12k+ | No | **45%** | Module-based; GraphQL API; complex setup |

**Winner: PGlite + pgvector** — in-process, already in stack, zero extra infra. Confirmed bundled and working.  
**Fallback 1: Vectra** — when running in browser/edge context without PGlite.  
**Fallback 2: Qdrant** — for SaaS multi-user path where dedicated vector infra is warranted.

---

## 6. Context Engine / RAG

| Name | License | Lang | Stars | TS Fit % | Notes |
|------|---------|------|-------|----------|-------|
| **Mastra RAG** | Apache-2.0 | TS-native | (Mastra) | **90%** | Built-in chunking, embedding, pgvector retrieval; document loaders; re-ranking; zero extra dep |
| **LlamaIndex.TS** | MIT | TS-native | 4k+ (TS repo) | **80%** | Bun-compatible; pgvector vector store integration; agentic RAG; broader doc loaders than Mastra; standalone option |
| **LangChain.js retrievers** | MIT | TS (port) | 13k+ | **55%** | Functional but lags Python; use only if already in LangChain ecosystem |
| **Custom on PGlite+pgvector** | N/A | TS | N/A | **85%** | Direct `SELECT ... ORDER BY embedding <=> $1 LIMIT k` queries; full control; minimal dep; must-write |

**Winner: Mastra RAG** for integrated path. **LlamaIndex.TS** as standalone option if Mastra not used.  
**Must-write:** Lightweight retrieval wrapper (`src/memory/retriever.ts`) that queries PGlite pgvector directly — needed regardless of which framework wins because Fulcrum needs project-scoped + global-scoped query separation.

---

## 7. Job Queue / Orchestration Runtime

| Name | License | Lang | Stars | Self-host | Postgres-backed | TS Fit % | Notes |
|------|---------|------|-------|-----------|-----------------|----------|-------|
| **graphile-worker** | MIT | TS-native | 3k+ | Yes (same Postgres) | YES | **90%** | <5ms job latency; 196k jobs/sec; runs in same Node/Bun process; SQL API for enqueueing from PGlite triggers; zero extra service |
| **pg-boss** | MIT | TS-native | 4k+ | Yes | YES | **85%** | Simpler API; retry/dead-letter/schedule built-in; custom schema; slightly higher latency than graphile-worker |
| **Inngest** | Server: Apache-2.0; Cloud: SaaS | TS-native | 8k+ | Yes (Postgres mode, Jan 2025) | YES (Postgres mode) | **85%** | Durable step functions; AgentKit layer; MCP dev server; checkpointing (Dec 2025); self-host = `docker run` + Postgres; freemium cloud |
| **Trigger.dev v4** | Apache-2.0 | TS-native | 10k+ | Yes (Docker + Postgres) | YES | **80%** | Best self-host story; no run limits; AI agent runtime in v4; 15-min setup; heavier than graphile-worker |
| **BullMQ** | MIT | TS-native | 8k+ | Requires Redis | NO (Redis) | **30%** | Redis dependency breaks PGlite-only constraint |
| **Temporal** | MIT | TS SDK + Go server | 13k+ | Yes but heavy | NO (custom) | **40%** | Go server required; overkill for local-first |

**Winner: graphile-worker** — same Postgres as PGlite, TS-native, fastest latency, zero extra service. Run as library in Bun process.  
**Failure gate:** graphile-worker requires persistent connection; PGlite in-memory mode loses queue on restart → use PGlite file-backed mode (default for Fulcrum).  
**Fallback 1: pg-boss** — simpler API, same Postgres, good dead-letter queue support.  
**Fallback 2: Inngest** — when durable step functions + visual debugging > minimal infra; self-host on same Postgres.

---

## 8. Skills System

### mattpocock/skills Workflow

Install: `npx skills@latest add mattpocock/skills` → interactive selector → `/setup-matt-pocock-skills` configures issue tracker + docs locations. Skills are SKILL.md files with frontmatter (`name`, `description`, `triggers`), invoked via slash command. Composable + per-repo config stored on setup. Fulcrum already follows this pattern with 29 in-repo skills.

### Skills Candidates

| Name | License | Domain | TS Fit % | Notes |
|------|---------|--------|----------|-------|
| **mattpocock/skills (via fulcrum install)** | MIT | Engineering + productivity skills | **95%** | Already integrated pattern; `fulcrum skills sync` distributes to 5 agents; SKILL.md format proven |
| **MCP servers as skills** | MIT/Apache | Tool integrations via MCP protocol | **90%** | Each MCP server = callable skill; already in Fulcrum MCP registry; Claude Code + Cursor + Windsurf support |
| **Anthropic built-in tools** | Anthropic TOS | Web search, code exec, files | **80%** | Available via Claude Agent SDK; no extra install; limited customization |
| **Claude plugins marketplace** | Anthropic TOS | Plugin-namespaced skills | **85%** | Fulcrum already uses `fulcrum@fulcrum` plugin namespace for Claude Code |
| **Repomix generate_skill** | MIT | Auto-generate skills from codebases | **80%** | MCP tool; `generate_skill` from codebase → SKILL.md; useful for onboarding new repos |

**Skills loader architecture:** `fulcrum skills sync` remains canonical. Add `--fetch-upstream` flag to pull fresh from `mattpocock/skills` repo and merge. Skills treated as packages: version-pinned in `skills.lock.json`, content-verified via hash. MCP servers register as virtual skills in the same registry.

---

## 9. Auto-Assignment / Routing Heuristics

| Name | License | Lang | TS Fit % | Notes |
|------|---------|------|----------|-------|
| **json-rules-engine** | ISC | TS-native | **85%** | Declarative JSON rules; facts-based evaluation; `7.3.1` stable; 190+ dependents; good for static routing tables |
| **LLM-as-router (Vercel AI SDK)** | Apache-2.0 | TS | **85%** | `generateObject` with Zod schema → `{ agent: string, confidence: number }`; cheap with Haiku/Flash; context-aware |
| **Mastra routing** | Apache-2.0 | TS | **80%** | Mastra workflow `branch()` + condition functions; type-safe; integrated with agent definitions |
| **@inngest/agent-kit Router** | Apache-2.0 | TS | **80%** | Built-in Network Router; deterministic or LLM-driven; Network State carries routing context |
| **OPA (Open Policy Agent)** | Apache-2.0 | Go + WASM | **40%** | Policy-as-code; WASM runtime available in TS but complex; overkill unless compliance needed |
| **Drools / Clara-rules** | Apache-2.0 | Java/Clojure | **5%** | JVM; not viable in Bun |

**Must-write: `src/router/auto-assign.ts`** — hybrid approach:
1. Static rules first (`json-rules-engine`): task-type → agent mapping declared in `config/routing-rules.json`
2. LLM fallback (Haiku via Vercel AI SDK): if no static rule matches → structured output `{ agent, reasoning }`
3. User override always wins (explicit `--agent` flag)

---

## 10. Recommended Agent-OS Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Fulcrum CLI (Bun binary)                               │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Task System │  │ Agent Router │  │ Skills Loader │  │
│  │ (graphile-  │  │ (json-rules  │  │ (SKILL.md +   │  │
│  │  worker /   │  │  + LLM fall- │  │  MCP registry)│  │
│  │  PGlite)    │  │  back Haiku) │  └───────────────┘  │
│  └──────┬──────┘  └──────┬───────┘                     │
│         │                │                             │
│  ┌──────▼────────────────▼──────────────────────────┐  │
│  │  Mastra Agent Orchestration Layer                 │  │
│  │  (agents + workflows + tool registry)            │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  LLM Client: Vercel AI SDK (provider-agnostic)   │  │
│  │  Claude Agent SDK TS v2 (Claude-specific runs)   │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  PGlite (file-backed)                            │  │
│  │  ├── pgvector: embeddings (memory + RAG)         │  │
│  │  ├── graphile-worker: job queue                  │  │
│  │  ├── memories table: per-project + global        │  │
│  │  ├── tasks / agent_runs / artifacts tables       │  │
│  │  └── routing_rules table (overrides JSON rules)  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Optional Python sidecars (spawn on-demand, HTTP):
  mem0-server (port 8765) — richer memory extraction
  litellm-proxy (port 8766) — advanced LLM routing/cost tracking
```

### Picks Per Layer

| Layer | Pick | License | Fit % | Failure Gate |
|-------|------|---------|-------|--------------|
| Agent orchestration | **Mastra** | Apache-2.0 | 90% | EE multi-tenancy locked → build wrapper |
| LLM client | **Vercel AI SDK v6** | Apache-2.0 | 90% | Provider lock → abstraction layer preserves swap |
| Agent SDK | **Claude Agent SDK TS v2** | MIT | 85% | Claude-only → Vercel AI SDK for non-Claude agents |
| Memory engine | **Mastra Memory (PGlite+pgvector)** | Apache-2.0 | 90% | Complex graph needs → mem0 HTTP sidecar |
| Vector store | **PGlite + pgvector** | PostgreSQL/Apache | 95% | Edge/browser deploy → Vectra |
| RAG / context | **Mastra RAG + custom retriever** | Apache-2.0 | 90% | Custom project scoping → must-write retriever.ts |
| Job queue | **graphile-worker** | MIT | 90% | PGlite in-memory → enforce file-backed mode |
| Skills loader | **SKILL.md + MCP registry** | MIT/various | 95% | Upstream changes → version-pin + hash verify |
| Auto-router | **json-rules-engine + LLM Haiku** | ISC/Apache | 85% | No rule match → LLM fallback; user override wins |
| Durable runtime (future) | **Trigger.dev v4** | Apache-2.0 | 80% | Scale > single process → migrate job queue |

### TS-vs-Python Split

**TS-native (required — no Python):**
- All of Fulcrum CLI binary
- Mastra agent/workflow definitions
- Vercel AI SDK calls
- graphile-worker job handlers
- SKILL.md loader + MCP client
- json-rules-engine routing rules
- PGlite schema + migrations
- Custom memory retriever

**Python sidecar (acceptable — spawn via `Bun.spawn`, communicate HTTP):**
- `mem0` server — Python core; JS SDK exists but self-hosted server is Python; spawn when richer memory extraction needed (entity extraction, contradiction detection)
- `LiteLLM proxy` — when cost tracking + load balancing across providers needed at scale; TS calls via `xh` / `fetch` to `localhost:8766`
- `Cognee` (if adopted) — Python-only; MCP bridge is the cleanest TS integration

**Sidecar contract:**
- Sidecars must expose OpenAI-compatible HTTP or documented REST
- Started lazily by `fulcrum doctor --start-sidecars`
- Health-checked before task dispatch; if down, Fulcrum falls back to in-process alternatives
- Never required for local-first baseline — optional enhancement layer

### Failure Gates + Fallbacks Summary

| Component | Primary | Gate | Fallback 1 | Fallback 2 |
|-----------|---------|------|------------|------------|
| Orchestration | Mastra | EE gating / breaking change | @inngest/agent-kit | Vercel AI SDK + custom |
| Memory | Mastra Memory | Complex graph / cross-session facts | mem0 HTTP (Python sidecar) | Zep `zep-js` npm |
| Vector store | PGlite+pgvector | Browser/edge deploy | Vectra (file-backed) | Qdrant (SaaS path) |
| Job queue | graphile-worker | Multi-machine scale | pg-boss | Inngest self-host |
| LLM routing | Vercel AI SDK | Provider outage | LiteLLM proxy | Direct Anthropic/OpenAI SDK |
| Skills loader | SKILL.md + MCP | Upstream SKILL.md format break | Manual JSON manifest | Embedded static registry |
| Auto-router | json-rules-engine | No rule match | LLM Haiku (structured output) | Round-robin / user pick |

---

## 11. Must-Write Gaps

These are not available off-the-shelf in TS and must be built:

1. **`src/memory/retriever.ts`** — Project-scoped + global-scoped pgvector query wrapper. `SELECT ... WHERE (project_id = $1 OR global = true) ORDER BY embedding <=> $2 LIMIT $3`. Recency decay scoring. ~150 LOC. **Biggest gap.**

2. **`src/router/auto-assign.ts`** — Hybrid static-then-LLM task router. Loads `config/routing-rules.json` into json-rules-engine; falls back to `generateObject` (Haiku); respects `--agent` CLI override. ~200 LOC.

3. **`src/memory/schema.ts`** — PGlite migration for `memories`, `memory_links`, `agent_runs`, `artifacts` tables. Include pgvector extension enable + HNSW index creation. ~100 LOC.

4. **`src/skills/upstream-sync.ts`** — `--fetch-upstream` flag: `git clone --depth 1 mattpocock/skills` → diff SKILL.md files → apply non-conflicting → prompt on conflicts. ~250 LOC.

5. **`src/agents/tenant-wrapper.ts`** — Mastra multi-tenancy shim: namespace all Mastra storage calls with `tenant_id` prefix until Mastra ships native multi-user. ~100 LOC. Needed for SaaS path.

**Biggest must-write gap:** The memory retriever (`src/memory/retriever.ts`) — no existing TS library handles combined project-scoped + global-scoped pgvector retrieval with the recency/relevance hybrid score needed for agent context assembly.

**Most awkward TS/Python boundary:** `mem0` self-hosted. The JS SDK (`MemoryClient`) only speaks to their cloud or a Python-process server. Running mem0 locally requires a Python sidecar process — there is no WASM or Node port. The boundary is clean (HTTP) but the operational burden (Python env management, process lifecycle, health checks) is non-trivial. Mitigation: `fulcrum doctor --start-sidecars` manages the process; or skip mem0 entirely and rely on Mastra Memory + custom retriever for 90% of cases.

---

## Sources Consulted

- Mastra: https://github.com/mastra-ai/mastra · https://mastra.ai/blog/choosing-a-js-agent-framework
- @inngest/agent-kit: https://github.com/inngest/agent-kit · https://agentkit.inngest.com
- Inngest self-host: https://www.inngest.com/blog/inngest-1-0-announcing-self-hosting-support
- Trigger.dev v3/v4: https://trigger.dev/blog/v3-announcement · https://trigger.dev/docs/self-hosting/overview
- Vercel AI SDK: https://vercel.com/blog/ai-sdk-6 · https://github.com/vercel/ai
- Claude Agent SDK TS: https://platform.claude.com/docs/en/agent-sdk/typescript · https://github.com/anthropics/claude-agent-sdk-typescript
- mem0: https://github.com/mem0ai/mem0 · https://docs.mem0.ai/open-source/overview
- Letta: https://github.com/letta-ai/letta · https://docs.letta.com
- Zep: https://github.com/getzep/zep-js
- Cognee: https://github.com/topoteretes/cognee · https://www.cognee.ai
- PGlite+pgvector: https://pglite.dev/extensions/ · https://news.ycombinator.com/item?id=41224689
- Vectra: https://github.com/Stevenic/vectra
- graphile-worker: https://worker.graphile.org · https://github.com/graphile/worker
- pg-boss: https://github.com/timgit/pg-boss
- LlamaIndex.TS: https://ts.llamaindex.ai
- LiteLLM: https://docs.litellm.ai · https://github.com/BerriAI/litellm
- mattpocock/skills: https://github.com/mattpocock/skills
- json-rules-engine: https://github.com/CacheControl/json-rules-engine
- LangGraph vs Mastra: https://dev.to/jim_l_efc70c3a738e9f4baa7/i-switched-from-langgraph-to-mastra
- Speakeasy framework comparison: https://www.speakeasy.com/blog/ai-agent-framework-comparison
