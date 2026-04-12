# Gap Analysis

Generated: 2026-04-12  
Baseline: spec v0.1  
Current state: empty repository (spec + prompt only)

## Summary

| Gap Category | Count | Priority |
|---|---|---|
| Project/package setup | 1 | P0 |
| ID system | 1 | P0 |
| Object models/schemas | 1 | P0 |
| SQLite schema | 1 | P0 |
| Adapter layer | 1 | P0 |
| Event system | 1 | P0 |
| Agent-home structure | 1 | P0 |
| Policy skeleton | 1 | P0 |
| Core control plane | 1 | P1 |
| Board/projection system | 1 | P1 |
| CLI tooling | 1 | P1 |
| Memory/indexing layer | 1 | P2 |
| Workflow engine | 1 | P3 |
| Coded workflows (4) | 4 | P3 |
| Routing/single-worker | 1 | P4 |
| Team system | 1 | P5 |
| Worktree/merge queue | 1 | P6 |
| Security/policy hardening | 1 | P7 |
| Plane adapter | 1 | P8 |
| Analytics | 1 | P9 |
| Monitor web UI | 1 | P1–P9 |
| Tests | 1 | All phases |

**Total gaps: 22 major subsystems, all at zero implementation.**

---

## Detailed Gaps

### G-001: Python Package Setup
**Spec ref:** Implied throughout  
**Missing:** pyproject.toml, dependency declarations, build config, uv.lock  
**Target:** pyproject.toml with all dependencies

### G-002: Typed ID System (§6)
**Missing:** ULID-based typed prefix ID generation and validation  
**Target:** src/pi_agent_os/ids.py

### G-003: Pydantic Object Models (§5, §6, §7)
**Missing:** All 20+ object types with correct fields, status enums, lifecycle constraints  
**Target:** src/pi_agent_os/models/

### G-004: SQLite Schema (§8.4)
**Missing:** All table groups (core objects, relations, projections, analytics, policy, sync, FTS)  
**Target:** src/pi_agent_os/db/schema.sql + migrations

### G-005: Read/Write Adapter Interfaces (§9)
**Missing:** All 17 write services + 28 read adapters with minimum interface  
**Target:** src/pi_agent_os/adapters/

### G-006: Event Schema + Emitter (§19.9, §19.10)
**Missing:** Event model, event types enum, emitter, append-only log  
**Target:** src/pi_agent_os/events/

### G-007: Agent-Home Structure (§8.3)
**Missing:** Directory template + init script  
**Target:** src/pi_agent_os/agent_home.py + agent-home-template/

### G-008: Policy Skeleton (§21)
**Missing:** Policy rule model, eval engine, pre-execution check API  
**Target:** src/pi_agent_os/policy/

### G-009: Core Control Plane Objects (Phase 1)
**Missing:** Full CRUD for workspaces, projects, epics, issues, tasks, subtasks  
**Target:** src/pi_agent_os/adapters/writers/ + SQLite integration

### G-010: Board/Projection System (§11)
**Missing:** Board projection tables + update logic  
**Target:** src/pi_agent_os/projections/

### G-011: CLI Status Tools (§24)
**Missing:** `pi task list`, `pi agent status`, `pi board`, etc.  
**Target:** src/pi_agent_os/cli/

### G-012: Memory Architecture (§10)
**Missing:** Memory facade, scope handling, recall modes, FTS+vector hybrid search  
**Target:** src/pi_agent_os/memory/

### G-013: Code/Project Ingestion (§10.9–10.12)
**Missing:** File walker, tree-sitter parsing, symbol extraction, index pipeline  
**Target:** src/pi_agent_os/indexing/

### G-014: Workflow Engine (§13)
**Missing:** DAG runner, step types, resume, retry, timeout, artifact/memory declarations  
**Target:** src/pi_agent_os/workflows/engine/

### G-015–G-018: Coded Workflows (§23)
**Missing:** grill-me, write-a-prd, prd-to-plan, prd-to-issues  
**Target:** workflows/{grill-me,write-a-prd,prd-to-plan,prd-to-issues}/

### G-019: Routing + PI Profile Mapping (§15, §16)
**Missing:** Role vocabulary, PI profile mapping, fallback chain, routing logic  
**Target:** src/pi_agent_os/routing/

### G-020: Single-Worker Lifecycle (§17)
**Missing:** Worker session, task packet, run result structure, live status  
**Target:** src/pi_agent_os/worker/

### G-021: Team System (§15)
**Missing:** TeamTemplate, TeamInstance, slot resolution, concurrency caps, L1-only gate  
**Target:** src/pi_agent_os/teams/

### G-022: Worktree + Merge Queue (§18)
**Missing:** Worktree allocator, merge queue, integration worker, conflict handling  
**Target:** src/pi_agent_os/worktrees/

### G-023: Security/Policy Hardening (§21)
**Missing:** Full deny rules, secret guard, pre-execution enforcement, audit log  
**Target:** src/pi_agent_os/policy/ (extend G-008)

### G-024: Plane Adapter (§22)
**Missing:** Mapping layer, transport layer, sync-policy layer, sync state tracking  
**Target:** src/pi_agent_os/sync/

### G-025: Analytics + Monitor Web UI (§19, §20)
**Missing:** Metrics rollup, burndown, SSE monitor server, 8 monitor views  
**Target:** src/pi_agent_os/monitor/ + src/pi_agent_os/analytics/

### G-026: Tests
**Missing:** All unit/integration/scenario tests  
**Target:** tests/
