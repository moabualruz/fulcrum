# Assumptions

## A-001: PI Runtime
PI runtime is assumed to be a local agent execution system (similar to open-source agent frameworks). 
The control plane, memory, workflow, monitor, and policy subsystems are implemented as standalone modules 
that integrate with PI via a defined adapter interface. Where PI specifics are unknown, the adapter 
interface is left as an abstract class/protocol with stub implementations.

## A-002: Python Version
Python 3.12+ is assumed available on the target system.

## A-003: SQLite FTS5
FTS5 extension is assumed available (default in Python 3.12+ builds on all major platforms).

## A-004: Local Qdrant
Qdrant is assumed runnable locally via Docker or as an embedded process. The implementation defaults 
to in-memory Qdrant for tests and local-file Qdrant for development.

## A-005: Filesystem Layout
The `~/.pi-agent-home` directory is created on first use. The implementation manages this layout.

## A-006: Embedding Model
For vector search, an embedding model is required. Assumption: sentence-transformers with a small 
local model (e.g., all-MiniLM-L6-v2) is used by default, with the model path/name configurable.

## A-007: Plane API
Plane project management API is assumed to follow its standard REST API (self-hosted or cloud). 
The Plane adapter is implemented against the Plane REST API v1. Plane base URL and API key are 
configured per workspace.

## A-008: Tree-sitter Language Availability
tree-sitter-languages package is assumed to cover the common languages (Python, JS/TS, Go, Rust, 
Java, Ruby, etc.). Language parsers not available fall back to lexical/grep indexing.

## A-009: Non-trivial Work Definition
"Non-trivial work" requiring task creation per spec §11.4 is assumed to mean: any work that takes 
more than one atomic step or produces a durable artifact.

## A-010: Spec "Underspecified" Items
Items listed in spec §29 (open implementation details) will be resolved with the smallest correct 
implementation and documented in DECISIONS.log.

## A-011: SQLite FTS5 in uv-managed Python
FTS5 was disabled in earlier uv-managed Python builds due to a regression in python-build-standalone.
This was fixed in python-build-standalone release 20250712, picked up in uv 0.7.21 (July 2025).
Assumption: uv >= 0.7.21 is used. If using an older uv, `CREATE VIRTUAL TABLE ... USING fts5` will
silently fail and all memory searches will fall back to LIKE queries.
Run `uv self update && uv python upgrade` to get the fixed build.

## A-012: sentence-transformers Version
The package is pinned at `>=3.0`. The current published version is v5.x. The core `encode()` API
is stable across v3→v5. The deprecated `Asym` module (removed in v5) is not used anywhere in this
codebase. The `start_multi_process_pool()` / `encode_multi_process()` flow is also not used.

## A-013: OTel GenAI Semantic Conventions Stability
All `gen_ai.*` attributes in OTel semconv remain in Development stability (not Stable) as of
semconv v1.37.0 (Aug 2025). The attribute rename gen_ai.system → gen_ai.provider.name from
v1.37.0 is applied, and both attributes are emitted for backwards compatibility.
The spec (§3.6) only requires GenAI observability — not stable/finalized convention compliance.

## A-014: MCP SDK vs FastMCP
The codebase uses the official Anthropic `mcp` Python SDK (v1.x) and its `mcp.server.fastmcp.FastMCP`
class. This is NOT the separate PrefectHQ `fastmcp` package. The import `from mcp.server.fastmcp
import FastMCP` is stable in mcp SDK v1.x.
