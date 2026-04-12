# Blockers

## B-001: PI Runtime Not Directly Available
**Status:** Active — working around  
**Spec sections affected:** §3.1, §3.2, §4.x, §16.x, §17.x  
**Description:** PI is referenced as the execution host and extension runtime, but is not a 
standalone installable Python package known to this implementation. The exact PI API (how to 
register profiles, invoke subagents, use team runtime, etc.) is not directly accessible.  
**Impact:** Cannot implement PI-native profile mapping, PI-native team invocation, PI subagent 
execution, PI extension registration as live integration.  
**Workaround:** 
- Define `PIRuntimeAdapter` as an abstract interface with clear method signatures
- Provide a `StubPIRuntimeAdapter` for testing/development
- All routing/team/execution code uses the adapter interface
- Document exact PI hooks needed so integration can be completed when PI API is available  
**Remaining manual check:** Swap `StubPIRuntimeAdapter` with real `PIRuntimeAdapter` once 
PI API/SDK is available.

## B-002: Qdrant Requires Running Service or Embedded Mode
**Status:** Active — working around  
**Spec sections affected:** §8.1, §8.5, §10.x  
**Description:** Qdrant requires either a local server process or embedded mode (available in 
qdrant-client >= 1.7 with embedded support, or via Docker).  
**Impact:** Vector search won't work without Qdrant available.  
**Workaround:** 
- Default to in-memory Qdrant client for tests
- Flag if Qdrant not reachable and fall back to FTS5-only recall
- Provide docker-compose.yml and bootstrap script for local Qdrant

## B-003: Graph Memory Backend
**Status:** Active — working around  
**Spec sections affected:** §8.1, §8.6, §10.x  
**Description:** graphiti-core requires a Neo4j or compatible graph database. Neo4j is not assumed 
to be locally available.  
**Workaround:** 
- Implement a SQLite-backed graph memory adapter as the default fallback
- graphiti-core integration is wired but optional (enabled via config)
- The memory facade hides the backend choice

## B-004: Embedding Model Download
**Status:** Active — working around  
**Spec sections affected:** §10.7  
**Description:** sentence-transformers requires downloading a model on first use (~90MB for MiniLM).  
**Workaround:** Embedding is skipped/mocked if model not available. FTS5 provides lexical recall only 
when embeddings unavailable. Bootstrap script downloads model.
