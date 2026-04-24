# LanceDB Adapter Boundary

Capability: semantic and hybrid retrieval.

LanceDB may own local vector/full-text/hybrid retrieval for code chunks and derived docs
where LightRAG and Zoekt do not cover the need. Fulcrum owns chunk identity, update
intent, graph links, and final context fusion.

Validation gates:

- local embedded profile works without service ops
- changed chunks replace old embeddings
- deleted files remove chunk rows
- hybrid results can be fused with Zoekt and Tree-sitter output
