# LanceDB Adapter Boundary

Capability: semantic and hybrid retrieval.

LanceDB may own local vector/full-text/hybrid retrieval for code chunks and derived docs
where LightRAG and Zoekt do not cover the need. Fulcrum owns chunk identity, update
intent, graph links, and final context fusion.

Certification contract:

- adapter certification must be in-process testable
- tests must not start LanceDB services or invoke external binaries
- certified capabilities: semantic chunk contract, hybrid result explanation contract, delete removes chunk refs contract
- Fulcrum context packs must explain whether a result came from exact, path, import, symbol, or semantic matching

Validation gates:

- local embedded profile works without service ops
- changed chunks replace old embeddings
- deleted files remove chunk rows
- hybrid results can be fused with Zoekt and Tree-sitter output
- stale snapshot entries are detected before semantic rows are trusted
