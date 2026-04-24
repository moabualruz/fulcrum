# LightRAG Adapter Boundary

Capability: memory graph RAG sidecar.

LightRAG may own retrieval graph internals for markdown docs and L0 memory imports.
Fulcrum owns source IDs, path metadata, provenance, tombstones, OS graph refs,
update/delete intent, and links to tasks, runs, code, and artifacts.

## Install Command Plan

Docs source checked through Context7 for `/hkuds/lightrag` on 2026-04-24.
The sidecar certification contract records this install plan without executing it
in crate tests:

```bash
python -m venv adapters/lightrag/.venv
pip install lightrag-hku[offline]
```

The offline extra is required for local certification. Source installs using
`uv sync --extra test --extra offline` or `pip install -e ".[test,offline]"` are
valid development alternatives, but Fulcrum's adapter contract stores the
minimal package install plan above.

## Health Check

Certified health check:

```bash
python -c "from lightrag import LightRAG; print('LightRAG imported')"
```

Expected stdout contains `LightRAG imported`. Health checks in unit tests are
contract checks only: no socket open, no HTTP request, no running sidecar.

## Capability Matrix

| Operation | Supported | Mutates sidecar | Full rebuild required | Network in tests | Contract |
| --- | --- | --- | --- | --- | --- |
| `health_check` | yes | no | no | no | Import LightRAG locally. |
| `import_markdown` | yes | yes | no | no | Accept canonical markdown path/body plus Fulcrum source id. |
| `import_l0` | yes | yes | no | no | Preserve caller-provided `l0` source id through sidecar records. |
| `update` | yes | yes | no | no | Replace source body by id without full rebuild. |
| `delete` | yes | yes | no | no | Delete source by id; Fulcrum retains tombstone and provenance trace. |
| `query` | yes | no | no | no | Return ranked hits with source id, path, score, graph refs, and provenance trace. |

## Fulcrum Ownership

- Source IDs are deterministic for path imports and caller-owned for explicit
  L0 imports.
- Path metadata stores original path, normalized path, extension, and content
  type.
- Update increments source version and index revision without full rebuild.
- Delete removes active retrieval edges and writes a tombstone.
- Query explanations are context-pack-friendly: query terms, matched terms,
  score, stage labels, source diversity key, graph refs, and provenance steps.
- LightRAG retrieval graph refs remain separate from the Fulcrum OS graph.

## Validation Gates

- Directory markdown import is deterministic and markdown-only.
- Markdown and L0 import preserve Fulcrum source IDs.
- Update/delete works without full rebuild.
- Delete retains tombstones.
- Query results include source/provenance trace and context-pack explanation.
- CPU/local profile is certifiable by import-only health check.
- Retrieval graph remains separate from Fulcrum OS graph.
