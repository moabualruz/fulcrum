# Roadmap Review

## Blockers

- Useful Alpha sequencing is inconsistent. Release Bands define Useful Alpha as M0-M5, but the Cross-Milestone Acceptance Matrix requires `core`/`code`/`memory` install and doctor before Useful Alpha, while M6 is the milestone that delivers setup profiles, setup lock/receipts, repair/uninstall/logs, offline flags, and sidecar setup. Fix by either moving M6 setup/profile work into M0-M4 as hard gates, or redefining Useful Alpha as M0-M6.

## Improvements To Apply

- Add explicit statement near status/scope that the current branch is alpha/spike foundation, not product-ready, and real adapters are still missing for Zoekt, LanceDB, LightRAG, git commands, Windmill, and Plane. This is called out in `agent-os-full-product-delivery-plan.md` and prevents the roadmap from overclaiming readiness.
- Add `fulcrum validate` to command contracts and milestones. Source requirements preserve it as a release-quality command, but the roadmap only implies clean-machine scripts and smoke checks.
- Add first-class recovery commands/acceptance for `import`, `rebuild-index`, `reset`, and clean uninstall. The shipping definition mentions backup/restore/export/uninstall/purge, but `full-product-delivery-requirements.md` requires backup, restore, export, import, rebuild-index, reset, and clean uninstall as first-class flows.
- Strengthen setup download acceptance with temp-file writes, atomic moves, retry-safe behavior, and logging source URL/hash. The roadmap has pinning and SHA-256 verification, but misses these installer-safety details from cross-OS setup research.
- Add LightRAG sidecar port/socket allocation as an explicit open question or M4/M6 design item. Source research flags fixed port vs dynamic lockfile vs local socket; roadmap only says sidecar logs/ports/status.
- Tighten code/memory setup smoke criteria: LanceDB should smoke insert/query/delete on `$FULCRUM_HOME/indexes/lancedb`; Zoekt should index/query a fixture; memory doctor should prove LightRAG import/API plus provider chat/embedding health. Roadmap says "doctor smokes each selected capability" but lacks these concrete gates.
- Add `fulcrum action run smoke` to M7 acceptance. Cross-OS setup research uses this as the proof that Windmill logs map into Fulcrum events.
- Make secret handling acceptance explicit for indexing and retrieval, not only traces/logs/artifacts. Source requirements say secrets must be excluded from default indexing/retrieval and `.gitignore`/`.fulcrum/ignore` respected.
- Expand adapter certification template with CRUD/update/delete semantics and offline boot behavior. Current template has read/write and offline behavior, but source inputs ask for CRUD/read-write contract, update/delete semantics, and offline boot.
- Add supported OS matrix gates earlier. The roadmap leaves final OS matrix open and M9 has Windows packaging decision, but cross-OS setup research requires Linux, macOS, and Windows setup behavior; at minimum M6 should name target OS smoke coverage and Windows-specific constraints.
- Add missing external links: Docker Compose install docs, uv docs, LanceDB quickstart/search pages, and Ollama OpenAI compatibility docs. These are source links that support setup/profile decisions.
- Add measurable local model/LightRAG performance acceptance or keep it as a named open question. `agent-os-system-design-plan.md` calls out CPU/local model performance threshold as unresolved; roadmap has broad performance budgets only at M12.

## No-Change Notes

- No blocker found in core product ownership. Roadmap correctly keeps Fulcrum canonical for task/run/event/state, keeps Plane/Windmill optional, and separates Fulcrum OS graph from LightRAG retrieval graph.
- No blocker found in model posture. Roadmap preserves OpenAI-compatible provider config, Ollama as preset only, Qwen3 normal local tier, explicit remote opt-in, and embedding dimension drift blocking.
- No blocker found in code intelligence architecture. Roadmap preserves Tree-sitter + Zoekt + LanceDB layering, lexical-first ranking, incremental create/update/delete/rename, and stale-row handling.
