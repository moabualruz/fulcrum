# Gap Analysis

Last updated: 2026-04-13 (session 3)
Spec: pi_local_first_agent_os_spec.md v0.2

## Summary

All 22 originally identified gaps are **resolved**. Implementation is complete across all 11 phases.

New gaps discovered via session 3 code review and web research are tracked below as hardening items. These are not spec violations — the spec is met — but they represent correctness and robustness improvements found during critical review.

---

## Resolved Gaps (All Originally Identified)

| Gap | Description | Resolution |
|---|---|---|
| G-001 | Python package setup | `pyproject.toml` with all deps, uv |
| G-002 | Typed ID system | `ids.py`, 21 prefixes, ULID |
| G-003 | Pydantic object models | `models/` — 20+ models |
| G-004 | SQLite schema | `db/schema.sql` (764L), migrations |
| G-005 | Read/write adapters | All writers + read adapters |
| G-006 | Event system | `events/store.py` + FTS |
| G-007 | Agent-home structure | `agent_home.py` |
| G-008 | Policy skeleton | `policy/engine.py` |
| G-009 | Core control plane | All CRUD + board projection |
| G-010 | CLI tooling | All 14 command groups |
| G-011 | Memory/indexing | `memory/` facade + FTS5 + Qdrant |
| G-012 | Workflow engine | DAG runner + 15 step types |
| G-013 | Coded workflows (4) | grill-me, write-a-prd, prd-to-plan, prd-to-issues |
| G-014 | Routing + single worker | `routing/` + `worker/lifecycle.py` |
| G-015 | Team system | `teams/` + TeamScheduler |
| G-016 | Worktrees + merge queue | `worktrees/` + IntegrationWorker |
| G-017 | Security + policy | Deny rules + SecretGuard + hooks |
| G-018 | Plane adapter | `sync/plane_adapter.py` |
| G-019 | Analytics | `analytics/metrics.py` |
| G-020 | Monitor server | FastAPI + SSE, 17+ endpoints |
| G-021 | External CLI integration | MCP + Claude/Gemini hooks + OTel |
| G-022 | Tests | 215 tests across 11 phases |

---

## Hardening Gaps Found in Session 3 Code Review

These are now **fixed** in the current codebase. Documented here for traceability.

### H-001: CoSContextBuilder wrong MemoryFacade kwargs (FIXED)
**File:** `worker/cos_context.py`  
**Issue:** `_memories_section()` called `recall(scope="project", scope_id=...)` — kwargs don't exist on `MemoryFacade.recall()`. Required `workspace_id=` and `project_id=`.  
**Fix:** Corrected to `recall(workspace_id=..., project_id=..., limit=...)`.

### H-002: CoSResponseParser wrong MemoryFacade write kwargs (FIXED)
**File:** `worker/cos_context.py`  
**Issue:** `_apply_memory_notes()` called `memory_facade.write(content=note, scope_id=...)` — wrong kwargs. Required `workspace_id=`, `title=`, `summary=`, `project_id=`.  
**Fix:** Corrected all kwargs to match `MemoryFacade.write()` signature.

### H-003: PolicyEngine SYSTEM_INVARIANTS dead code (FIXED)
**File:** `policy/engine.py`  
**Issue:** `SYSTEM_INVARIANTS` class attribute defined but `_load_rules()` only returned DB rules — the hardcoded L1-only team invariant was never evaluated.  
**Fix:** `_load_rules()` now prepends system invariant rules at priority=1000 when applicable.

### H-004: RouteDecision.fallback_chain default=None (FIXED)
**File:** `routing/router.py`  
**Issue:** `fallback_chain: list[str] = None` in the dataclass — accessing `.append()` or iterating would raise `AttributeError`.  
**Fix:** Changed to `field(default_factory=list)`.

### H-005: Artifact gate SQL NULL subquery (FIXED)
**File:** `worktrees/integration_worker.py`  
**Issue:** `WHERE r.id IN (SELECT run_id FROM merge_queue_projection WHERE worktree_id=?)` — if `run_id` is NULL for items enqueued without a run, the subquery returns NULLs and `IN (NULL)` always evaluates to UNKNOWN (never TRUE in SQL), so the gate always raised ArtifactGateError.  
**Fix:** Added `AND run_id IS NOT NULL` to the subquery.

### H-006: SQLite datetime adapter deprecation (FIXED)
**File:** `db/connection.py`  
**Issue:** Python 3.12+ deprecates the default datetime adapter. 7 DeprecationWarnings emitted during tests.  
**Fix:** Registered explicit `sqlite3.register_adapter(datetime, ...)` + `register_converter()`, added `detect_types=PARSE_DECLTYPES` to `connect()`.

### H-007: `_db_path` global not thread-safe (FIXED)
**File:** `db/connection.py`  
**Issue:** `configure()` modified `_db_path` global without a lock — race condition under concurrent thread startup.  
**Fix:** Added `threading.Lock()` protecting reads and writes of `_db_path`.

### H-008: `_append_to_log` not atomic under concurrency (FIXED)
**File:** `events/store.py`  
**Issue:** Multiple threads emitting events concurrently would interleave writes to the JSONL file.  
**Fix:** Added `threading.Lock()` around file open+write.

### H-009: `apply_migrations` non-idempotent version recording (FIXED)
**File:** `db/migrations.py`  
**Issue:** `executescript()` auto-commits the schema; if the subsequent version INSERT fails, the migration is applied but not recorded — re-running will fail with "table already exists".  
**Fix:** Split into per-migration commits + `INSERT OR IGNORE` for idempotency.

### H-010: CoSResponseParser fragile JSON regex (FIXED)
**File:** `worker/cos_context.py`  
**Issue:** The bare JSON fallback regex `\{[^{}]*\"thinking\"[^{}]*\}` failed on any response where `thinking` contained a nested object.  
**Fix:** Replaced with a brace-depth scanner + `_build_decision()` helper.

### H-011: OTel gen_ai.system renamed (FIXED)
**File:** `telemetry/spans.py`  
**Issue:** OTel semconv v1.37.0 (Aug 2025) renamed `gen_ai.system` to `gen_ai.provider.name`. Using only the old name breaks newer collectors.  
**Fix:** Emit both `gen_ai.provider.name` (new) and `gen_ai.system` (legacy) for backwards compatibility. Added cache token attributes.

---

## Remaining Open Gaps

| ID | Description | Priority | Status |
|---|---|---|---|
| R-001 | Live PI runtime (requires Node.js + npm install) | P1 | BLOCKED (external dep) |
| R-002 | No CI pipeline | P2 | Not in spec scope |
| R-003 | Monitor server has no auth | P3 | By design (local-only) |
| R-004 | uv-managed Python FTS5 requires uv ≥ 0.7.21 | P2 | Document in ASSUMPTIONS.md |
| R-005 | `sentence-transformers` pinned at `>=3.0` but v5.x current | P2 | Works; update constraint |
