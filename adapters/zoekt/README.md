# Zoekt Adapter Boundary

Capability: code lexical search.

Zoekt may own exact, regex, path, ranking, and code-oriented lexical search indexes.
Fulcrum owns file identity, graph links, indexing lifecycle, and result fusion.

Validation gates:

- changed files update search results incrementally
- deleted files disappear from search
- exact identifier search beats semantic-only hits
- results can carry Fulcrum file/chunk refs
