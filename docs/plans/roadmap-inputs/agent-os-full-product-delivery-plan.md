# Agent OS Full Product Delivery Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md

## Must Carry Into Roadmap
- Shipping definition: clean-machine install; daemon lifecycle and health; persistent local state; CLI daily workflow; live cockpit/TUI parity; real project code index and markdown memory import; explainable context packs with citations; worktree produce/review/merge-or-block loop; tested backup/restore/uninstall; optional products missing without breaking `core`; local-only privacy defaults.
- Language decisions: Rust for kernel/daemon/CLI/supervisor/index orchestration; TypeScript for cockpit UI; Python only behind supervised LightRAG sidecar; Windmill only as optional product script/action profile.
- Default profile: `core`. Default development target: `core` + `code` + markdown memory import.
- Dependency posture: doctor is readiness authority; install performs only safe/reversible managed setup. Dependency states must remain `managed`, `detected`, `guided`, `optional`, `blocked`.
- Memory provider contract: generic OpenAI-compatible config (`base_url`, chat model, embedding model, dimensions, API key env). Ollama is preset, not required dependency.
- Model tiers: normal local Qwen3 embedding/reranking/chat family; low-resource `all-minilm`/`embeddinggemma`; remote providers only explicit opt-in.
- Embedding drift: doctor must block silent dimension/model mismatch and require vector rebuild.
- Core state ownership: canonical state survives backup/restore; derived code/memory indexes are rebuildable.
- Privacy/security defaults: loopback bind; no remote model/provider/export/sync without opt-in; `.gitignore` plus `.fulcrum/ignore`; secret exclusion/redaction; purgeable logs/artifacts.
- Current branch must be framed as alpha/spike foundation, not product-ready. Real adapters still missing for Zoekt/LanceDB/LightRAG/git commands/Windmill/Plane.

## Milestone Impacts
- M0 Bootstrap/Product Skeleton: installable local binary; config/default paths; SQLite WAL migration ledger; daemon lockfile/socket/PID; `init/up/down/status/doctor`; backup manifest; clean install smoke.
- M1 Task/Run/Event Loop: task/run/action/artifact/policy schemas; state machines; supervised stub/subprocess runner; heartbeat/cancel/block/fail/complete; artifact capture; SSE stream; event replay.
- M2 Cockpit/TUI Alpha: owned UI before Plane; global/per-project board; live active runs; blockers, artifacts, review/merge queues, policy decisions, adapter/sidecar health.
- M3 Code Intelligence Alpha: Tree-sitter symbols/imports/chunks; Zoekt exact/path/regex or explicit fallback; LanceDB semantic/hybrid or explicit fallback; incremental create/update/delete/rename; explainable ranked context packs.
- M4 Markdown Memory Alpha: markdown/L0 import; source IDs/paths; update/delete recall changes; LightRAG graph separate from OS graph; RAG-Anything deferred; provider doctor gates.
- M5 Worktree Delivery Alpha: task branch/worktree allocation; run/artifact attachment; dirty/untracked detection; review queue; merge queue success/conflict block; cleanup protects unmerged work.
- M6 Sidecar Supervisor/Profiles: enable/disable profiles; start/stop sidecars; visible logs/ports; degraded mode; adapter certification matrix.
- M7 Actions/Windmill: human-triggered actions only; map Windmill jobs to Fulcrum actions; stream logs/status; attach results; Fulcrum retains agent lifecycle ownership.
- M8 Plane Adapter Beta: optional PM surface; Plane work item to task mapping; webhook ingestion; reversible sync; outage must not break core/cockpit; footprint documented.
- M9 Packaging/Privacy/RC: Linux/macOS release artifacts; no remote network by default; backup/restore/uninstall; docs for install/privacy/troubleshooting/uninstall; signed/package quality remains release gate.
- DoD bands: Local Alpha = M0-M2; Useful Alpha = M0-M5; Beta = M0-M8 plus certified optional adapters; RC = M0-M9 plus clean-machine/security/uninstall/docs complete.

## Acceptance Criteria
- First run: no cloud credentials; state survives daemon restart; cockpit shows same task/run/event state; doctor green or actionable warnings.
- Context pack: exact code hits separated from semantic hits; memory sources include provenance; graph links explain inclusion; stale indexes visible.
- Worktree delivery: dirty state visible; artifacts attach to run; merge conflict blocks with reason; cleanup never silently deletes unmerged user work.
- Adapter certification: every adapter reports install command, local health, ID/ref mapping, CRUD/read-write contract, offline behavior, provenance, backup/restore posture, footprint, and profile.
- Adapter promotion: no adapter moves from experimental to profile default until certification passes in CI and clean-machine smoke.
- Security gates: network-deny core/first-run; secret fixture exclusion/redaction; ignore fixture for `.gitignore` and `.fulcrum/ignore`; loopback bind; purge test; explicit opt-in remote provider visibility.
- Clean-machine RC script must cover install, init/up/doctor, sample project/task/run/watch, cockpit smoke, artifacts, code index, memory import, context build, worktree/review/merge queue, profile enable/disable, policy smoke, backup, restart, restore verify/restore, uninstall with backup preservation.
- Packaging flow: release artifact includes CLI, daemon, cockpit assets, config template, license notices; first launch creates state only after explicit command; no post-install daemon autostart; upgrade backs up before migrations; rollback documented.

## Risks / Open Questions
- LanceDB Rust maturity unresolved; roadmap should allow native adapter, Rust sidecar/CLI bridge, or TypeScript sidecar chosen at M3 certification.
- LightRAG real supervised sidecar/socket not implemented; update/delete/provenance wrapper must be proven before memory profile is credible.
- Zoekt packaging unresolved; prefer pinned binary bundle, else detected/guided fallback. Go build-from-source should stay explicit fallback.
- Windmill and Plane local footprint unmeasured; keep out of default install until M6-M8 clean-machine gates.
- Real git command adapter missing; M5 currently relies on injectable provider model.
- Cockpit browser/TUI shell missing even though DTO/reducer model exists.
- Signed artifacts/security release mechanics remain planned under M9.
- Open question: exact supported OS matrix beyond Linux/macOS smoke.
- Open question: exact Tree-sitter language list for alpha certification.
- Open question: whether `rusqlite` remains enough or `sqlx` needed for async ergonomics.
- Open question: final model names/version pins must be captured when adapters enter implementation.

## Links To Preserve
- Source inputs: `docs/research/2026-04-24-local-first-agent-os-product-stack.md`, `docs/ideation/2026-04-24-agent-os-full-product-delivery-ideation.md`, `docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md`, `docs/plans/2026-04-24-agent-os-system-design-plan.md`, `docs/spikes/agent-os-validation.md`, `docs/research/2026-04-24-cross-os-adapter-setup-research.md`, `docs/research/2026-04-24-model-recommendations.md`.
- External references: Plane developer docs `https://developers.plane.so/`; Windmill self-host docs `https://www.windmill.dev/docs/advanced/self_host`; LightRAG `https://github.com/HKUDS/LightRAG` and `https://arxiv.org/abs/2410.05779`; RAG-Anything `https://github.com/HKUDS/RAG-Anything`; Zoekt `https://github.com/sourcegraph/zoekt`; Tree-sitter `https://github.com/tree-sitter/tree-sitter`; LanceDB `https://docs.lancedb.com/`; OpenTelemetry semantic conventions `https://opentelemetry.io/docs/concepts/semantic-conventions/`; Tauri docs via Context7 `/tauri-apps/tauri-docs`.
- Traceability: R1-R5 -> M0/M6/M9; R6-R9 -> M0/M1/M9; R10-R13 -> M1/M2/M8; R14-R17 -> M1/M5; R18-R23 -> M3/M4; R24-R28 -> M6/M7/M8; R29-R33 -> M0/M3/M4/M9; R34-R37 -> all milestones with M9 gate.
