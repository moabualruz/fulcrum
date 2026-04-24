# Cross-OS Adapter Setup Research

Date: 2026-04-24
Status: implementation research

## Problem

The current `fulcrum setup install <profile>` implementation is not product setup. It prints a plan. That is useful for preview, but it does not install or provision the adapter dependencies needed for a working local agent OS.

Required outcome:

- `fulcrum setup install code` creates a working code-search stack.
- `fulcrum setup install memory` creates a working markdown memory and graph RAG stack.
- `fulcrum setup install actions` creates a working optional workflow sidecar when Docker is available.
- `fulcrum setup doctor <profile>` proves those exact installed assets work.
- Setup works on Linux, macOS, and Windows with minimum user friction.
- Planning/preview remains available, but it cannot be the install path.

## Research Sources

- uv official docs via Context7: `/astral-sh/uv`, standalone installers and `uv venv` / `uv pip sync`.
- Zoekt official repository: https://github.com/sourcegraph/zoekt
- LanceDB official quickstart: https://docs.lancedb.com/quickstart
- Tree-sitter official docs: https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html
- LightRAG official README: https://github.com/HKUDS/LightRAG
- Docker Compose official install docs: https://docs.docker.com/compose/install/
- Ollama official docs: https://docs.ollama.com/capabilities/embeddings and https://docs.ollama.com/api/openai-compatibility
- Model defaults and provider tiers: `docs/research/2026-04-24-model-recommendations.md`

## Core Setup Decision

Fulcrum should use `doctor` as the setup authority and use a managed local toolcache under `$FULCRUM_HOME` only for dependencies Fulcrum can install safely and reversibly.

Do not lock the product to one setup path for every dependency. Classify each dependency:

| Class | Meaning | Product Behavior |
|---|---|---|
| `managed` | Fulcrum can install/provision safely under `$FULCRUM_HOME`. | `setup install` performs the work and writes a receipt. |
| `detected` | User already has a compatible host install. | `doctor` records path/version and setup uses it. |
| `guided` | Setup is OS/vendor-specific, large, privileged, or user-preference-heavy. | `doctor` explains exact install choices and verification command. |
| `optional` | Needed only for selected profile/capability. | Missing state is warning unless profile requires it. |
| `blocked` | Required for requested profile and neither managed nor detected. | `doctor` fails with action steps. |

This keeps first-run friction low without pretending every machine should be mutated the same way.

```text
$FULCRUM_HOME/
  bin/
    fulcrum-managed wrappers and downloaded tools
  sidecars/
    zoekt/
    lightrag/
    windmill/
    plane/
  indexes/
    zoekt/
    lancedb/
    memory/
  parsers/
    manifest.json
  logs/
    setup/
  manifests/
    setup-lock.toml
    tools.toml
```

`setup-lock.toml` is mandatory. It records:

- profile
- host OS and architecture
- installed dependency versions
- source URL or local source
- SHA-256
- installed paths
- health command and last result
- whether dependency is managed by Fulcrum or discovered from host PATH

This lets `install`, `doctor`, `repair`, and `uninstall` operate on real state, not assumptions.

## Command Contract

| Command | Behavior |
|---|---|
| `fulcrum setup plan <profile>` | Read-only preview. Shows what install would do. |
| `fulcrum setup install <profile>` | Real idempotent install/provision for managed/easy dependencies. Mutates `$FULCRUM_HOME`. |
| `fulcrum setup install <profile> --offline` | Uses only existing toolcache and host tools. Fails if assets missing. |
| `fulcrum setup doctor <profile>` | Verifies installed assets, host fallbacks, and configured providers. Prints guided fixes for missing deps. |
| `fulcrum setup repair <profile>` | Re-runs missing or failed install steps. |
| `fulcrum setup uninstall <profile>` | Removes Fulcrum-managed derived assets for that profile. Preserves backups by default. |
| `fulcrum setup logs` | Prints setup log file paths and latest failure summary. |

Do not overload `install` as preview. Preview belongs to `plan`.

Do not force one provider. The memory stack should accept any compatible LLM and embedding endpoint.

## Dependency Strategy By Capability

### Tree-sitter

Best setup:

- Do not require `tree-sitter-cli` at runtime for standard languages.
- Compile or bundle parser libraries with Fulcrum release for supported languages.
- Setup only writes `parsers/manifest.json` and runs parser smoke tests.
- Keep `tree-sitter-cli` optional for advanced custom grammar development.
- Classification: `managed`.

Why:

- Official docs list CLI install options through Cargo, npm, or binary release, and note parser development can require Node and C/C++ compilers.
- Requiring compilers on every user machine creates high friction, especially Windows.
- Runtime parsing should use embedded parser artifacts, not compile grammars during install.

Install step:

```text
create $FULCRUM_HOME/parsers/manifest.json
run built-in parser smoke over Rust/TypeScript/Markdown fixtures
record parser ABI and language versions in setup-lock.toml
```

Doctor:

```text
parse fixtures through Fulcrum parser registry
fail if any built-in parser cannot load
```

### LanceDB

Best setup:

- Treat LanceDB as an embedded library, not a sidecar.
- Prefer Rust integration if the Rust SDK covers required table/search operations.
- Otherwise use a small managed Python helper inside the same uv project as memory/code semantic indexing.
- Setup creates and opens `$FULCRUM_HOME/indexes/lancedb`.
- Classification: `managed` when embedded, `managed-python-helper` only if native Rust path is insufficient.

Why:

- Official LanceDB docs describe OSS LanceDB as embedded and local-path based, similar to SQLite.
- No Docker or server should be required for the default code profile.

Install step:

```text
create $FULCRUM_HOME/indexes/lancedb
create/open smoke table
insert tiny vector
query tiny vector
delete smoke table
record lancedb backend kind: rust-native | python-helper
```

Doctor:

```text
open local LanceDB path
run insert/query/delete smoke
fail if schema/version incompatible
```

### Zoekt

Best setup:

- Fulcrum should prefer shipped pinned Zoekt binaries per OS/arch in Fulcrum release artifacts.
- Setup downloads those signed/hashed binaries into `$FULCRUM_HOME/sidecars/zoekt/bin` when available.
- Fallbacks:
  - use host `zoekt`, `zoekt-index`, `zoekt-git-index`, `zoekt-webserver` if compatible
  - build from source with Go only under explicit `--build-from-source`
  - use official container image only when Docker profile is enabled
- Classification: `managed` when Fulcrum binary bundle exists, `detected` for compatible host install, `guided` for Go build fallback.

Why:

- Official Zoekt docs show `go install` for command-based usage and a container image at `ghcr.io/sourcegraph/zoekt`.
- The repository page shows no GitHub releases. Requiring users to have Go for normal setup is not minimum friction.
- Container-only setup would force Docker into the `code` profile, which is too heavy.

Fulcrum release CI must build:

```text
zoekt
zoekt-index
zoekt-git-index
zoekt-webserver
```

for:

```text
linux-x86_64
linux-aarch64
macos-x86_64
macos-aarch64
windows-x86_64
windows-aarch64 if buildable
```

Install step:

```text
resolve tool manifest for host triple
download zoekt bundle to temp path
verify sha256
extract into $FULCRUM_HOME/sidecars/zoekt/bin
write $FULCRUM_HOME/bin/fulcrum-zoekt wrapper
create $FULCRUM_HOME/indexes/zoekt
index a tiny fixture repo
query fixture through zoekt CLI
record installed binary versions
```

Doctor:

```text
run zoekt binary version/help
index fixture into temp dir
query exact term and regex term
fail if index/query path broken
```

### uv And Python

Best setup:

- Prefer existing host `uv` when present and version-compatible.
- Install a Fulcrum-managed uv binary under `$FULCRUM_HOME/bin` only when the user opts in or when packaged release includes a verified uv asset.
- Do not require system Python as primary path; use uv-managed Python when possible.
- Classification: `detected` by default, `managed` when `--with-managed-uv` or packaged asset exists.

Why:

- uv official docs recommend standalone installers when no Python environment should be required.
- uv can create virtual environments and synchronize dependencies.
- This avoids Python/pip drift across OSs.

Install step:

```text
if compatible uv exists: record host uv
else download/install managed uv for host OS/arch
run uv --version
run uv python install 3.12 if needed
```

Doctor:

```text
uv --version
uv python list or managed Python smoke
```

### LightRAG Runtime

Best setup:

- Manage LightRAG as a uv project under `$FULCRUM_HOME/sidecars/lightrag`.
- Use `lightrag-hku[api]` for server/API integration.
- Run it as a supervised local sidecar only for the memory profile.
- Store all LightRAG data under `$FULCRUM_HOME/indexes/memory/lightrag`.
- Generate `.env` from Fulcrum config. Never rely on hand-edited env for default install.
- Classification: `managed` once uv is available; `blocked` if no Python/uv path exists.

Why:

- LightRAG official README recommends `uv tool install "lightrag-hku[api]"` for server tool install, and `uv sync` / `uv pip install lightrag-hku` for project/core install.
- The server provides API and Web UI support. API boundary is cleaner than importing Python directly into the Rust daemon.
- LightRAG requires LLM and embedding configuration. Setup must configure this or doctor must fail.

Install step:

```text
create $FULCRUM_HOME/sidecars/lightrag/pyproject.toml
pin lightrag-hku[api]
uv sync --locked, or uv pip sync from generated requirements lock
write .env from Fulcrum provider config
create data dir under $FULCRUM_HOME/indexes/memory/lightrag
run import smoke against a tiny markdown doc
run query smoke
record API port/socket and storage path
```

Doctor:

```text
uv run python -c "import lightrag"
start or contact lightrag-server on loopback
verify model provider health
import/query tiny markdown fixture
fail if provider missing
```

### LLM And Embedding Provider

Best setup:

- Add a provider configuration, not a hard dependency:
  - `openai-compatible`
  - `ollama-local` preset
  - `lmstudio-local` preset
  - `vllm-local` preset
  - `llama-cpp-local` preset
  - `localai` preset
  - remote OpenAI-compatible endpoint when user explicitly opts in
- `memory` is not fully functional until both embedding and LLM endpoints pass doctor.
- `setup install memory` may install LightRAG, but `setup doctor memory` remains the authority for provider readiness.
- Provider setup is `detected` or `guided` by default. Fulcrum should not require Ollama.

Generic provider config:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:11434/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "qwen3:8b"
embedding_model = "embeddinggemma"
embedding_dimensions = 768
```

Why:

- LightRAG works with configurable LLM and embedding providers; Fulcrum should validate the provider contract, not mandate a product.
- The embedding model and dimensions must stay stable across indexing and querying.
- Ollama is useful because official docs provide embeddings through CLI and `/api/embed` and expose OpenAI-compatible APIs, but it is only one preset.

Install step:

```text
read provider config
if provider missing:
  write doctor failure with presets and exact config examples
if provider preset selected:
  write config and run provider-specific smoke checks
write LightRAG env from generic provider config
record embedding model and dimensions in setup-lock.toml
```

Doctor:

```text
GET provider model list when supported
POST embedding request with configured embedding_model
POST chat/completion request with configured chat_model
verify same embedding model recorded in setup-lock.toml as index uses
```

Recommended model tiers live in `docs/research/2026-04-24-model-recommendations.md`. The setup implementation should expose them in `doctor` and provider presets:

- normal local: `Qwen3-Embedding-0.6B`, `Qwen3-Reranker-0.6B`, `Qwen3-14B`
- high local: Qwen3 4B/8B embedding and reranking, Qwen3 30B-A3B/32B chat
- remote opt-in: Codestral Embed / voyage-code-3 for code, Gemini/OpenAI embeddings for general, Cohere rerank, GPT-5/GPT-5.5 for chat
- low-resource fallback: `embeddinggemma` or `all-minilm`, plus `Qwen3-8B`

Ollama preset doctor can additionally check:

```text
GET http://127.0.0.1:11434/api/tags
POST http://127.0.0.1:11434/api/embed
OpenAI-compatible /v1/chat/completions smoke
```

Provider-missing doctor output should look like:

```text
dependency=memory-provider status=blocked
why=LightRAG needs both LLM and embedding endpoints for extraction/query.
fix=fulcrum setup provider configure --kind openai-compatible --base-url http://127.0.0.1:11434/v1 --chat-model qwen3:8b --embedding-model embeddinggemma --embedding-dimensions 768
presets=ollama-local,lmstudio-local,vllm-local,llama-cpp-local,localai,openai-compatible
```

### Windmill And Plane

Best setup:

- Keep out of default `core`, `code`, and `memory`.
- For `actions` and `full`, require Docker Desktop/Engine with Compose.
- Generate compose files under `$FULCRUM_HOME/sidecars/{windmill,plane}`.
- Run `docker compose pull` and `docker compose up -d` during real install only when profile selected.
- Classification: `guided` for Docker installation, `managed` for generated compose files and Fulcrum-owned adapter config.

Why:

- Docker Compose official docs recommend Docker Desktop for Docker Engine + CLI + Compose across Linux, macOS, and Windows. Linux can also use the Compose plugin.
- Windmill and Plane are heavier server products. They should be explicit profile choices.

Install step:

```text
verify docker version
verify docker compose version
write compose.yaml and .env
docker compose pull
docker compose up -d
wait for health endpoint
record ports and container IDs
```

Doctor:

```text
docker compose ps
health endpoint check
Fulcrum adapter API smoke
```

## Installer Architecture

### Rust Traits

```rust
trait SetupStep {
    fn id(&self) -> &'static str;
    fn dependency(&self) -> DependencyId;
    fn plan(&self, ctx: &SetupContext) -> StepPlan;
    fn install(&self, ctx: &mut SetupContext) -> Result<StepReceipt>;
    fn doctor(&self, ctx: &SetupContext) -> Result<HealthReceipt>;
    fn uninstall(&self, ctx: &mut SetupContext) -> Result<StepReceipt>;
}
```

`install()` must mutate or verify a real artifact. If a step only prints text, it is not an install step.

### Setup Context

```rust
struct SetupContext {
    home: PathBuf,
    host: HostTriple,
    network: NetworkMode,
    profile: SetupProfile,
    provider: ModelProvider,
    lockfile: SetupLock,
    progress: ProgressSink,
}
```

### Step Receipts

Every install step returns a receipt:

```toml
[[dependency]]
id = "zoekt"
managed = true
version = "pinned-commit-or-semver"
source = "https://github.com/fulcrum/releases/..."
sha256 = "..."
paths = [
  "~/.fulcrum/sidecars/zoekt/bin/zoekt",
  "~/.fulcrum/indexes/zoekt"
]
doctor = "passed"
installed_at = "2026-04-24T..."
```

No receipt means not installed.

## Network And Offline Policy

Modes:

| Mode | Meaning |
|---|---|
| default | Download required managed assets after showing progress. |
| `--offline` | No network. Use existing cache or host tools only. |
| `--no-model-download` | Install memory stack but do not pull model weights; doctor fails memory provider until configured. |
| `--host-tools-only` | Never download managed tools; use PATH only. |

All network downloads must:

- use pinned URLs from a manifest
- verify SHA-256
- download to temp file
- atomically move into final path
- log source URL and hash
- be resumable or safely retryable

## Progress Output

Human-readable default:

```text
setup profile=memory home=/home/mkh/.fulcrum
[1/6] uv            found host uv /usr/bin/uv
[2/6] python        installed managed python 3.12.8
[3/6] provider      configured openai-compatible endpoint http://127.0.0.1:11434/v1
[4/6] embeddings    verified embedding model and dimensions
[5/6] lightrag      uv sync ... done
[6/6] smoke         import/query markdown fixture ... pass
setup complete profile=memory doctor=pass
```

Machine-readable:

```bash
fulcrum setup install memory --json
```

Outputs JSONL events:

```json
{"event":"setup.step.started","id":"lightrag","index":5,"total":6}
{"event":"setup.step.completed","id":"lightrag","paths":["..."],"duration_ms":1234}
```

## Cross-OS Notes

### Linux

- Use `$FULCRUM_HOME` defaulting to `$HOME/.fulcrum`.
- Managed binaries go under `$FULCRUM_HOME/bin` and `$FULCRUM_HOME/sidecars`.
- Docker can be Docker Desktop or Engine + Compose plugin.
- Avoid writing `/usr/local/bin` unless user asks.

### macOS

- Use `$HOME/.fulcrum`.
- Managed CLI binaries can live under `$FULCRUM_HOME/bin`.
- Ollama official installer is an app plus CLI. Fulcrum should detect existing install first.
- Do not require Homebrew.

### Windows

- Use `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` once packaging is formalized.
- Managed binaries get `.exe` wrappers.
- Use PowerShell-safe paths and avoid shell-only scripts.
- Docker path requires Docker Desktop with WSL2 backend for optional sidecars.
- Do not require Visual Studio Build Tools for default setup. This is why Zoekt and Tree-sitter must be prebuilt/bundled.

## Implementation Order

1. Add setup lockfile and install receipts.
2. Convert `setup install` from print-only to executor.
3. Implement filesystem-only embedded steps:
   - directories
   - parser manifest
   - LanceDB local store smoke or placeholder until native adapter wired
4. Implement doctor capability matrix with `managed`, `detected`, `guided`, `optional`, and `blocked` states.
5. Implement uv/Python detection first, managed uv opt-in second.
6. Implement LightRAG uv project install and import smoke.
7. Add generic memory provider config and doctor:
   - OpenAI-compatible endpoint check
   - embedding dimensions recorded
   - presets for Ollama, LM Studio, vLLM, llama.cpp server, LocalAI
8. Implement Zoekt managed bundle download from Fulcrum release manifest.
9. Implement Docker sidecar compose setup for Windmill/Plane after Docker is detected.
10. Update `doctor` to use receipts plus real smoke checks.
11. Add clean-machine smoke scripts per OS.

## Acceptance Gates

### Code Profile

```bash
FULCRUM_HOME="$(mktemp -d)" fulcrum setup install code
fulcrum setup doctor code
fulcrum index project .
fulcrum search code "SetupPlanner"
```

Must prove:

- parser registry smoke passed
- Zoekt indexed and queried fixture
- LanceDB local path opened and queried
- project index updates on create/update/delete without full rebuild

### Memory Profile

```bash
export FULCRUM_HOME="$(mktemp -d)"
fulcrum setup provider configure --kind openai-compatible --base-url "$LOCAL_LLM_URL" --chat-model "$CHAT_MODEL" --embedding-model "$EMBED_MODEL" --embedding-dimensions "$EMBED_DIMS"
fulcrum setup install memory
fulcrum setup doctor memory
fulcrum memory import docs/
fulcrum memory query "adapter setup"
```

Must prove:

- uv/Python environment exists
- LightRAG imports
- model provider works
- embedding model fixed and recorded
- markdown import/update/delete/query works with provenance

### Actions Profile

```bash
FULCRUM_HOME="$(mktemp -d)" fulcrum setup install actions
fulcrum setup doctor actions
fulcrum action run smoke
```

Must prove:

- Docker Compose exists
- Windmill compose is up
- action run log maps back into Fulcrum events

## Direct Fix To Current Branch

Current code to replace:

- `crates/fulcrum-cli/src/main.rs`: `cmd_setup install` currently prints `install_mode=dry-run`.
- `crates/fulcrum-setup/src/lib.rs`: planner has no real executor, receipts, or lockfile.
- `docs/guides/setup-profiles.md`: says install is dry-run only.
- `tests/smoke/install_init_status.sh`: asserts dry-run output instead of installed artifacts.

New code needed:

- `SetupInstaller`
- `SetupLock`
- `SetupReceipt`
- `DownloadProvider`
- `CommandRunner`
- `ProgressSink`
- per-dependency installer modules
- fixture smoke tests for every dependency
- provider config and preset docs

## Final Recommendation

Build setup as a real local package manager for Fulcrum-managed dependencies:

1. Embed what can be embedded: Tree-sitter parsers and LanceDB integration.
2. Ship what is hard to build cross-platform: Zoekt binaries built by Fulcrum release CI.
3. Use uv for Python and LightRAG because it is the lowest-friction Python environment manager.
4. Add an explicit generic model provider contract. Ollama is only a preset, not a requirement.
5. Keep Docker products optional and profile-gated.
6. Make `install` mutate, `doctor` prove, and `plan` preview.

This is the setup path that can become a real product. The current dry-run setup cannot.
