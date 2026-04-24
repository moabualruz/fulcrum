# LightRAG Adapter Boundary

Capability: memory graph RAG.

LightRAG may own retrieval graph internals for markdown docs and L0 memory imports.
Fulcrum owns source IDs, provenance, OS graph refs, update/delete intent, and links to
tasks, runs, code, and artifacts.

Validation gates:

- markdown and L0 import preserve Fulcrum source IDs
- update/delete works without full rebuild
- query results include source/provenance trace
- CPU/local profile is usable
- retrieval graph remains separate from Fulcrum OS graph
