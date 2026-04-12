# Tasks

## Phase 0: Skeleton and Contracts

- [x] T-001: Read and ingest full spec
- [x] T-002: Write CURRENT_STATE.md
- [x] T-003: Write GAP_ANALYSIS.md
- [x] T-004: Write SPEC_TRACEABILITY.md
- [x] T-005: Write IMPLEMENTATION_PLAN.md
- [x] T-006: Write TASKS.md
- [x] T-007: Write DECISIONS.log
- [x] T-008: Write ASSUMPTIONS.md
- [x] T-009: Write BLOCKERS.md
- [x] T-010: Write VERIFY.md
- [x] T-011: Write CHANGELOG_IMPL.md
- [ ] T-012: Create pyproject.toml with all dependencies
- [ ] T-013: Implement src/pi_agent_os/ids.py (typed ULID IDs)
- [ ] T-014: Implement src/pi_agent_os/models/ (all Pydantic models)
- [ ] T-015: Implement src/pi_agent_os/db/schema.sql (full SQLite schema)
- [ ] T-016: Implement src/pi_agent_os/db/migrations.py
- [ ] T-017: Implement src/pi_agent_os/db/connection.py
- [ ] T-018: Implement src/pi_agent_os/events/ (event schema + emitter)
- [ ] T-019: Implement src/pi_agent_os/adapters/base.py (ABC interfaces)
- [ ] T-020: Implement src/pi_agent_os/agent_home.py
- [ ] T-021: Implement src/pi_agent_os/policy/engine.py (skeleton)
- [ ] T-022: Write tests/unit/test_ids.py
- [ ] T-023: Write tests/unit/test_models.py
- [ ] T-024: Write tests/unit/test_schema.py

## Phase 1: Core Control Plane

- [ ] T-025: Implement WorkspaceWriter + WorkspaceReadAdapter
- [ ] T-026: Implement ProjectWriter + ProjectReadAdapter
- [ ] T-027: Implement EpicWriter + EpicReadAdapter
- [ ] T-028: Implement IssueWriter + IssueReadAdapter
- [ ] T-029: Implement TaskWriter + TaskReadAdapter
- [ ] T-030: Implement event log + projections
- [ ] T-031: Implement board projection
- [ ] T-032: Implement CLI commands (workspace, project, issue, task, board)
- [ ] T-033: Implement monitor basic views
- [ ] T-034: Write tests/unit/test_control_plane.py
- [ ] T-035: Write tests/integration/test_issue_workflow.py

## Phase 2: Memory + Indexing

- [ ] T-036: Implement memory facade
- [ ] T-037: Implement code/project ingestion pipeline
- [ ] T-038: Implement tree-sitter symbol extraction
- [ ] T-039: Implement FTS5 memory search
- [ ] T-040: Implement Qdrant vector search adapter
- [ ] T-041: Implement recall modes
- [ ] T-042: Implement CLI memory commands
- [ ] T-043: Write tests/unit/test_memory.py
- [ ] T-044: Write tests/integration/test_ingestion.py

## Phase 3: Workflows

- [ ] T-045: Implement thin DAG workflow runner
- [ ] T-046: Implement all 15 step types
- [ ] T-047: Implement handoff packets
- [ ] T-048: Implement artifact contracts
- [ ] T-049: Implement grill-me coded workflow
- [ ] T-050: Implement write-a-prd coded workflow
- [ ] T-051: Implement prd-to-plan coded workflow
- [ ] T-052: Implement prd-to-issues coded workflow
- [ ] T-053: Write tests/unit/test_workflow_engine.py
- [ ] T-054: Write tests/scenarios/test_grill_me.py

## Phase 4: Routing + Single Worker

- [ ] T-055: Implement role vocabulary
- [ ] T-056: Implement PI profile mapping adapter
- [ ] T-057: Implement routing logic + fallback chains
- [ ] T-058: Implement single-worker lifecycle
- [ ] T-059: Implement CLI agent commands
- [ ] T-060: Write tests/unit/test_routing.py

## Phase 5: Teams

- [ ] T-061: Implement TeamTemplate
- [ ] T-062: Implement TeamInstance + slot resolution
- [ ] T-063: Implement concurrency caps
- [ ] T-064: Implement L1-only gate
- [ ] T-065: Write tests/unit/test_teams.py

## Phase 6: Worktrees + Integration

- [ ] T-066: Implement worktree allocator
- [ ] T-067: Implement merge queue
- [ ] T-068: Implement integration worker
- [ ] T-069: Implement conflict handling
- [ ] T-070: Write tests/unit/test_worktrees.py

## Phase 7: Security + Policy

- [ ] T-071: Implement full deny rules
- [ ] T-072: Implement secret guard
- [ ] T-073: Implement pre-execution enforcement
- [ ] T-074: Implement audit log views
- [ ] T-075: Write tests/unit/test_policy.py
- [ ] T-076: Write tests/scenarios/test_deny_rule_trip.py

## Phase 8: Plane Adapter

- [ ] T-077: Implement Plane adapter (3 layers)
- [ ] T-078: Implement sync state tracking
- [ ] T-079: Write tests/unit/test_plane_adapter.py

## Phase 9: Analytics + Polish

- [ ] T-080: Implement burndown
- [ ] T-081: Implement flow metrics
- [ ] T-082: Implement all 8 monitor views
- [ ] T-083: Write tests/unit/test_analytics.py

## Golden Scenarios

- [ ] T-090: Scenario: research-only request
- [ ] T-091: Scenario: grill-me planning flow
- [ ] T-092: Scenario: single-agent implementation
- [ ] T-093: Scenario: team feature build
- [ ] T-094: Scenario: non-git project flow
- [ ] T-095: Scenario: submodule-aware change
- [ ] T-096: Scenario: deny-rule trip
- [ ] T-097: Scenario: Plane sync drift/conflict
