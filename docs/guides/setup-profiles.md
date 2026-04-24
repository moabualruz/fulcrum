# Setup Profiles

Fulcrum setup profiles are local-first install plans. The planner detects host OS and CPU architecture, selects dependencies for the requested profile, emits dry-run install steps, health checks, uninstall steps, and certification gates.

No setup profile should perform network or package-manager work during planning. `--dry-run` is the contract for previewing commands before any future executor exists.

## Commands

Plan a profile:

```bash
fulcrum setup plan core
fulcrum setup plan code
fulcrum setup plan memory
fulcrum setup plan actions
fulcrum setup plan full
```

Preview install steps. This is still dry-run only in this branch:

```bash
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

`setup doctor` fails when required host commands are missing. Optional dependencies such as Docker-backed Windmill and Plane are warnings until explicitly enabled as real installers.

Preview uninstall:

```bash
fulcrum setup uninstall full
fulcrum setup uninstall full --purge-backups
```

Default uninstall preserves `$FULCRUM_HOME/backups`. `--purge-backups` is explicit opt-in and should be blocked by confirmation in any future non-dry-run executor.

## Profile Behavior

| Profile | Dependencies | Sidecars | Intended use |
|---------|--------------|----------|--------------|
| `core` | none outside Fulcrum | none | Local config, storage, daemon state, policy, and base CLI operations. |
| `code` | Tree-sitter parsers, Zoekt, LanceDB | Zoekt managed locally | Local code indexing with parser metadata, lexical search, and semantic vector search. |
| `memory` | Python, uv, LightRAG | LightRAG managed via uv/Python | Local memory retrieval and graph indexing. |
| `actions` | optional Docker, Windmill | optional Windmill | Human-triggered workflows/actions. Fulcrum still owns agent lifecycle and live run state. |
| `full` | `code` + `memory` + `actions` + optional Plane | Zoekt, LightRAG, optional Windmill and Plane | Complete local-first profile. Windmill and Plane are optional Docker-backed sidecars. |

## Cross-OS Strategy

Every dependency install, health, and uninstall step must expose Linux, macOS, and Windows strategy text. The strategy can differ by path conventions and runtime manager:

- Linux uses `$FULCRUM_HOME/...` paths and native binaries where needed.
- macOS uses `$FULCRUM_HOME/...` paths and native binaries where needed.
- Windows uses `%FULCRUM_HOME%\...` paths and `.exe` binaries where needed.

Tree-sitter parsers are prepared from a vendored parser bundle. Zoekt is installed as a pinned local binary. LanceDB is provisioned as a local derived index store. Python and uv support LightRAG through a locked uv project. Docker is optional and used only for Windmill and Plane in the `full` profile.

## Certification Gates

`fulcrum setup plan <profile>` reports static certification gates:

- host-targeted-plan: host OS and architecture were detected.
- required-dependencies-planned: every required dependency has install steps.
- health-checks-planned: every dependency has a health check.
- cross-os-strategy: every dependency step includes Linux, macOS, and Windows strategy.
- optional-sidecars: warning when optional Docker-backed sidecars are present.

Warnings do not fail certification. Failures indicate missing required steps or missing cross-OS strategy coverage.

`fulcrum setup doctor <profile>` separately checks the current host for required commands. Static plan certification can pass while host doctor fails if a required runtime is missing.
