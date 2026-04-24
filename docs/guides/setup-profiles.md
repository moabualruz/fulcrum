# Setup Profiles

Fulcrum setup profiles are local-first install and readiness flows.

`setup plan` previews. `setup install` installs/provisions safe Fulcrum-managed assets. `setup doctor` is the authority that proves readiness and prints exact fixes for missing host/provider dependencies.

Fulcrum should not force one setup path for every machine. It installs easy reversible pieces and guides heavy or user-specific pieces.

## Commands

Plan a profile:

```bash
fulcrum setup plan core
fulcrum setup plan code
fulcrum setup plan memory
fulcrum setup plan actions
fulcrum setup plan full
```

Install safe managed pieces:

```bash
fulcrum setup install core
fulcrum setup install code
fulcrum setup install memory
fulcrum setup install full
```

Run host dependency checks for a profile:

```bash
fulcrum setup doctor core
fulcrum setup doctor code
fulcrum setup doctor memory
fulcrum setup doctor actions
fulcrum setup doctor full
```

Configure memory provider when using LightRAG:

```bash
fulcrum setup provider configure \
  --kind openai-compatible \
  --base-url http://127.0.0.1:11434/v1 \
  --chat-model qwen3:8b \
  --embedding-model embeddinggemma \
  --embedding-dimensions 768
```

The URL and models are examples. Any compatible LLM and embedding endpoint can be used.

Preview uninstall:

```bash
fulcrum setup uninstall full
fulcrum setup uninstall full --purge-backups
```

Default uninstall preserves `$FULCRUM_HOME/backups`. `--purge-backups` is explicit opt-in and should be blocked by confirmation in any future non-dry-run executor.

## Setup States

Doctor reports every dependency in one of these states:

| State | Meaning |
|---|---|
| `managed` | Fulcrum installed/provisioned it under `$FULCRUM_HOME`. |
| `detected` | Compatible host dependency was found. |
| `guided` | User must install/configure it outside Fulcrum. Doctor prints exact steps. |
| `optional` | Missing dependency is only needed for selected optional profile. |
| `blocked` | Required dependency is missing for the requested profile. |

`install` should create real assets for `managed` dependencies and write receipts. `doctor` should verify receipts, host tools, providers, and smoke tests.

## Profile Behavior

| Profile | Dependencies | Sidecars | Intended use |
|---------|--------------|----------|--------------|
| `core` | none outside Fulcrum | none | Local config, storage, daemon state, policy, and base CLI operations. |
| `code` | Tree-sitter parsers, Zoekt, LanceDB | Zoekt managed locally | Local code indexing with parser metadata, lexical search, and semantic vector search. |
| `memory` | uv/Python path, LightRAG, generic LLM + embedding provider | LightRAG managed via uv/Python | Local memory retrieval and graph indexing. |
| `actions` | optional Docker, Windmill | optional Windmill | Human-triggered workflows/actions. Fulcrum still owns agent lifecycle and live run state. |
| `full` | `code` + `memory` + `actions` + optional Plane | Zoekt, LightRAG, optional Windmill and Plane | Complete local-first profile. Windmill and Plane are optional Docker-backed sidecars. |

## What Install Should Create

| Profile | Managed install work |
|---|---|
| `core` | `$FULCRUM_HOME` dirs, config, DB, logs, backups, manifests. |
| `code` | parser manifest/assets, code index dirs, LanceDB local store smoke, Zoekt bundle/wrapper if Fulcrum-managed bundle exists. |
| `memory` | LightRAG uv project under `$FULCRUM_HOME/sidecars/lightrag`, memory index dirs, provider env generated from config. |
| `actions` | Windmill compose/env files when Docker is detected or after user confirms Docker path. |
| `full` | all selected profile assets plus optional Plane compose/env files. |

Host package managers, Docker Desktop, and model/provider products should not be forced by default. Doctor detects and guides them.

## Memory Provider

LightRAG needs both:

- LLM endpoint for extraction/query
- embedding endpoint with stable model and dimensions

Fulcrum config uses a generic provider contract:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:11434/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "qwen3:8b"
embedding_model = "embeddinggemma"
embedding_dimensions = 768
```

Supported presets should include:

- `ollama-local`
- `lmstudio-local`
- `vllm-local`
- `llama-cpp-local`
- `localai`
- `openai-compatible`

Ollama is only a preset. It is not required.

## Cross-OS Strategy

Every dependency install, health, and uninstall step must expose Linux, macOS, and Windows strategy text. The strategy can differ by path conventions and runtime manager:

- Linux uses `$FULCRUM_HOME/...` paths and native binaries where needed.
- macOS uses `$FULCRUM_HOME/...` paths and native binaries where needed.
- Windows uses `%FULCRUM_HOME%\...` paths and `.exe` binaries where needed.

Tree-sitter parsers are prepared from a vendored parser bundle. LanceDB is provisioned as a local derived index store. Zoekt is installed from a Fulcrum-managed binary bundle when available, otherwise detected or guided. Python and uv support LightRAG through a locked uv project. Docker is optional and used only for Windmill and Plane profiles.

## Human Quick Path

```bash
fulcrum init
fulcrum setup install core
fulcrum setup doctor core
fulcrum setup install code
fulcrum setup doctor code
```

For memory:

```bash
fulcrum setup provider configure --kind openai-compatible --base-url <url> --chat-model <model> --embedding-model <model> --embedding-dimensions <n>
fulcrum setup install memory
fulcrum setup doctor memory
```

## Agent Quick Path

Agents should use JSON and stop on `blocked`:

```bash
fulcrum setup install core --json
fulcrum setup doctor core --json
fulcrum setup install code --json
fulcrum setup doctor code --json
fulcrum setup doctor memory --json
```

Agents should not guess provider choices. If memory provider is missing, report the missing fields and available presets.

## Certification Gates

`fulcrum setup plan <profile>` reports static certification gates:

- host-targeted-plan: host OS and architecture were detected.
- required-dependencies-planned: every required dependency has install steps.
- health-checks-planned: every dependency has a health check.
- cross-os-strategy: every dependency step includes Linux, macOS, and Windows strategy.
- optional-sidecars: warning when optional Docker-backed sidecars are present.

Warnings do not fail certification. Failures indicate missing required steps or missing cross-OS strategy coverage.

`fulcrum setup doctor <profile>` separately checks installed receipts, current host tools, configured providers, and smoke tests. Static plan certification can pass while doctor fails if a required runtime or provider is missing.
