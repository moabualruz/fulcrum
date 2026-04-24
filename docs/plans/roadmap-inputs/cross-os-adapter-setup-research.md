# Cross OS Adapter Setup Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-cross-os-adapter-setup-research.md

## Must Carry Into Roadmap
- Split setup commands by contract: `setup plan` is read-only preview, `setup install` mutates `$FULCRUM_HOME`, `setup doctor` proves installed assets and provider readiness.
- Make `doctor` setup authority. It must classify dependencies as `managed`, `detected`, `guided`, `optional`, or `blocked` and return exact fixes.
- Add mandatory `$FULCRUM_HOME/manifests/setup-lock.toml` with profile, host OS/arch, dependency versions, source URLs/local sources, SHA-256, installed paths, health command, last result, and managed-vs-detected status.
- Use managed local toolcache only for safe reversible assets under `$FULCRUM_HOME/bin`, `sidecars/`, `indexes/`, `parsers/`, `logs/setup/`, and `manifests/`.
- Support `install --offline`, `--no-model-download`, and `--host-tools-only`; all downloads must come from pinned manifests, verify SHA-256, use temp files, move atomically, log source/hash, and retry safely.
- Tree-sitter: bundle/compile parser libraries with Fulcrum release, avoid runtime `tree-sitter-cli` for standard languages, write parser manifest, run fixture smoke tests.
- LanceDB: treat as embedded local store, create/open `$FULCRUM_HOME/indexes/lancedb`, smoke insert/query/delete; use Rust SDK if sufficient, otherwise managed uv Python helper.
- Zoekt: ship pinned Fulcrum-built binaries per OS/arch; detect compatible host install; Go build only behind explicit `--build-from-source`; Docker image only for Docker-enabled profiles.
- uv/Python: detect compatible host `uv`; managed uv only by opt-in or packaged verified asset; prefer uv-managed Python over system Python for LightRAG path.
- LightRAG: manage as uv project under `$FULCRUM_HOME/sidecars/lightrag`, use `lightrag-hku[api]`, generate `.env` from Fulcrum config, store data in `$FULCRUM_HOME/indexes/memory/lightrag`.
- Provider contract: require generic configurable LLM plus embedding endpoints for memory readiness; presets include Ollama, LM Studio, vLLM, llama.cpp server, LocalAI, and remote OpenAI-compatible opt-in. Ollama is preset, not requirement.
- Record embedding model and dimensions in lockfile and verify consistency during doctor and query/index use.
- Windmill/Plane: keep out of default `core`, `code`, and `memory`; require Docker Compose only for `actions` and `full`; manage generated compose files and adapter config.
- Output must support human progress and JSONL events for automation.
- Cross-OS defaults: Linux/macOS use `$HOME/.fulcrum`; Windows use `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` once packaging is formalized; avoid `/usr/local/bin`, Homebrew, shell-only scripts, Visual Studio Build Tools, and Docker for default setup.

## Milestone Impacts
- Setup foundation milestone: add `SetupInstaller`, `SetupLock`, `SetupReceipt`, `DownloadProvider`, `CommandRunner`, `ProgressSink`, per-dependency installer modules, and receipt-backed uninstall/repair.
- CLI milestone: replace current dry-run `setup install` behavior with real executor; preserve preview as `setup plan`; add `setup repair`, `setup uninstall`, and `setup logs`.
- Doctor milestone: implement capability matrix and real smoke checks for parser registry, LanceDB, Zoekt, uv/Python, LightRAG, providers, and Docker sidecars.
- Code profile milestone: bundle parser artifacts, provision LanceDB path, install/detect Zoekt, index/query fixture, then prove project search and incremental index updates.
- Memory profile milestone: add provider config command/presets, LightRAG uv sidecar, markdown import/update/delete/query smoke with provenance, and model/dimension lock enforcement.
- Actions/full milestone: defer Windmill/Plane until Docker detection and generated compose setup are ready; keep failure guided when Docker missing.
- Release engineering milestone: build and publish Zoekt binaries for linux-x86_64, linux-aarch64, macos-x86_64, macos-aarch64, windows-x86_64, and windows-aarch64 if buildable.
- Documentation/test milestone: update setup profile docs away from dry-run claims; replace smoke tests that assert `install_mode=dry-run` with artifact and doctor gates; add clean-machine OS smoke scripts.

## Acceptance Criteria
- `FULCRUM_HOME="$(mktemp -d)" fulcrum setup install code && fulcrum setup doctor code` installs or detects required code assets and passes parser, Zoekt, and LanceDB smoke checks.
- Code profile can run `fulcrum index project .` and `fulcrum search code "SetupPlanner"`; project index updates on create/update/delete without full rebuild.
- Memory profile requires configured provider before full readiness; `setup doctor memory` fails blocked with exact provider command and presets when LLM or embedding endpoint is missing.
- With provider configured, `fulcrum setup install memory && fulcrum setup doctor memory` proves uv/Python, LightRAG import/API, provider chat/embedding health, fixed embedding model/dimensions, and markdown import/query.
- `fulcrum memory import docs/` and `fulcrum memory query "adapter setup"` work with provenance and support import/update/delete behavior.
- Actions profile requires Docker Compose; `fulcrum setup install actions && fulcrum setup doctor actions && fulcrum action run smoke` proves compose services healthy and action logs map into Fulcrum events.
- `--offline` performs no network access and succeeds only with existing cache or host tools; missing required assets become blocked doctor/install failures with exact remediation.
- All managed downloads verify hash, write receipts, and can be repaired or uninstalled without touching host-global paths.
- Windows default setup does not require Visual Studio Build Tools, shell scripts, or manual PATH/global install changes.

## Risks / Open Questions
- LanceDB Rust SDK coverage may be insufficient for required table/search operations; fallback managed Python helper needs roadmap slot and isolation rules.
- Fulcrum release CI must own Zoekt builds because upstream has no standard release binaries; signing/hash manifest process is required.
- Windows aarch64 Zoekt buildability is uncertain; mark as best-effort until CI proves it.
- Managed uv policy needs product decision: opt-in only vs packaged verified asset by default.
- Provider UX needs exact command surface for `fulcrum setup provider configure` and storage location for secrets; avoid writing API keys directly into generated files when env indirection works.
- LightRAG server port/socket allocation and supervision model need design: fixed port, dynamic port in lockfile, or local socket.
- Docker sidecar scope for Plane may be heavy; confirm whether `actions` requires both Windmill and Plane or only Windmill first.
- Offline cache format and prefetch command are not defined in source doc.
- Packaging destination on Windows remains open between `%USERPROFILE%\.fulcrum` and `%LOCALAPPDATA%\Fulcrum`.

## Links To Preserve
- /home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-cross-os-adapter-setup-research.md
- /home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-model-recommendations.md
- https://github.com/sourcegraph/zoekt
- https://docs.lancedb.com/quickstart
- https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html
- https://github.com/HKUDS/LightRAG
- https://docs.docker.com/compose/install/
- https://docs.ollama.com/capabilities/embeddings
- https://docs.ollama.com/api/openai-compatibility
