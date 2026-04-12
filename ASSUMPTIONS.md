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
