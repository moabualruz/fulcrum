# Zoekt Adapter Boundary

Capability: code lexical search.

Zoekt may own exact, regex, path, ranking, and code-oriented lexical search indexes.
Fulcrum owns file identity, graph links, indexing lifecycle, and result fusion.

Certification contract:

- adapter certification must be in-process testable
- tests must not invoke `zoekt`, `zoekt-index`, or any external binary
- certified capabilities: exact query contract, path query contract, incremental delete contract
- Fulcrum snapshot state remains source of truth for file path, mtime, size, and content hash

Validation gates:

- changed files update search results incrementally
- deleted files disappear from search
- exact identifier search beats semantic-only hits
- results can carry Fulcrum file/chunk refs
- stale files are reported from Fulcrum snapshot comparison before adapter refresh
