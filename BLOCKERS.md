# Blockers

## B-001: PI Runtime — Bridge Scaffolded, Activation Requires Node.js
**Status:** Scaffolded — ready to activate  
**Spec sections affected:** §3.1, §3.2, §4.x, §16.x, §17.x  
**Description:** PI (`@mariozechner/pi-coding-agent`) is a TypeScript/Node.js terminal coding
agent — not a Python package. Communication is via JSON-RPC over stdio (`pi --rpc`).  
**What was built:**
- `PIRuntimeAdapter` ABC — clean interface with `spawn_agent`, `get_run_status`, `wait_for_run`, `list_profiles`, `invoke_team`
- `StubPIRuntimeAdapter` — fully functional for all tests and non-execution workflows
- `PIRPCBridge` (`worker/pi_rpc_bridge.py`) — real adapter that spawns `pi --rpc` as subprocess, bridges JSON-RPC over stdio with per-request Queue dispatch and daemon reader thread
- `auto_configure_pi_runtime()` — auto-detects PI in PATH, uses bridge if found, falls back to stub
- PI agent definition stubs in `src/pi_agent_os/pi_agents/` (one `.md` per role)  
**To activate:**
```bash
npm install -g @mariozechner/pi-coding-agent
npm install -g @tintinweb/pi-subagents   # for team/subagent support
# Then in Python:
from pi_agent_os.worker.pi_adapter import auto_configure_pi_runtime
auto_configure_pi_runtime()
```
See `PI_INTEGRATION.md` for the full guide.  
**Remaining gap:** No tests for PIRPCBridge (requires live `pi` process). All control-plane
features (tasks, memory, monitoring, policy, workflows) work without PI.

---

## B-002: Qdrant Vector Search — UNBLOCKED (local mode)
**Status:** Resolved — local in-process mode active  
**Spec sections affected:** §8.1, §8.5, §10.x  
**Resolution:** `qdrant-client>=1.9` supports fully in-process operation with no server:
- `QdrantClient(path="~/.pi-agent-home/qdrant")` — persistent disk-backed store
- `QdrantClient(":memory:")` — for tests  
**What was built:**
- `QdrantBackend` (`memory/backends/qdrant_backend.py`) — lazy-importing, gracefully degrades if package not installed; uses `all-MiniLM-L6-v2` (384 dims) via sentence-transformers
- `MemoryFacade(enable_qdrant=True, qdrant_path=...)` — Qdrant upsert wired into `write()` after SQLite; `recall(mode="semantic")` uses vector search with FTS5 fallback
- Collection schema: one `pi_memory` collection with all payload fields from spec §8.5  
**To activate:**
```python
from pi_agent_os.memory.facade import MemoryFacade
facade = MemoryFacade(enable_qdrant=True, qdrant_path="~/.pi-agent-home/qdrant")
```
**Remaining gap:** sentence-transformers downloads `all-MiniLM-L6-v2` (~22MB) on first use.

---

## B-003: Graph Memory Backend — UNBLOCKED (SQLite fallback)
**Status:** Resolved — SQLite graph backend active; graphiti/FalkorDB opt-in  
**Spec sections affected:** §8.1, §8.6, §10.x  
**Resolution:** SQLite graph backend covers 100% of spec §8.6 structured use cases.  
**What was built:**
- Migration 002: `graph_entities`, `graph_edges`, `graph_episodes` tables with indexes
- `SQLiteGraphBackend` (`memory/backends/graph_backend.py`) — `add_entity`, `add_edge`, `add_episode`, `get_entity`, `get_neighbors`, `search_entities`, `get_episodes`; full temporal validity intervals on edges
- 7 passing tests in `tests/unit/test_graph_backend.py`  
**graphiti/FalkorDB opt-in** (for NLP-based entity extraction):
```bash
docker run -p 6379:6379 falkordb/falkordb:latest
uv add "graphiti-core[falkordb]"
# Set ANTHROPIC_API_KEY — graphiti uses LLM for entity extraction
```
**Remaining gap:** SQLite backend requires explicit entity writes; graphiti auto-extracts
entities from free text via LLM. For the spec's structured use case (task outcomes,
decisions, facts) this is not a real limitation.

---

## B-004: Embedding Model Download — resolved in B-002
**Status:** Resolved as part of B-002 (lazy-load with graceful degradation).  
`sentence-transformers` downloads `all-MiniLM-L6-v2` (~22MB) on first use of Qdrant backend.
FTS5 lexical recall works without any model download.
