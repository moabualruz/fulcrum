# Plugins and Extensions

Fulcrum should not force one packaging model onto every agent runtime. Different agents expose different integration surfaces, so installation needs to adapt to the runtime's real capabilities.

## Runtime Matrix

| Runtime | Packaging model | Recommended Fulcrum path |
|---------|------------------|--------------------------|
| Claude Code | plugin-capable + hooks + skills | `plugin-first` in principle, currently hooks + skills as the best shipped path |
| Gemini CLI | extensions + hooks | `extension-first` |
| PI | extensions + native tools + cockpit widgets | `extension-first` |
| Cursor | project rules + config | `rules-first` |
| Windsurf | rules + config | `rules-first` |
| Codex | config + `AGENTS.md` | `config-first` |
| opencode | config + project docs | `config-first` |

## Commands

```bash
fulcrum install plan
fulcrum install plan --json
fulcrum init --adaptive
fulcrum init --cursor
fulcrum init --windsurf
fulcrum init --codex
fulcrum init --opencode
```

## Packaging Guidance

- Prefer a native plugin or extension when the runtime supports lifecycle hooks, bundled assets, and persistent data.
- Prefer project-local rules/config when the runtime is configuration-driven rather than extension-driven.
- Treat CLI-only mode as a valid product path for unsupported or headless environments.
- Keep install flows idempotent and safe to re-run.
- Ship repair guidance alongside install guidance: `fulcrum doctor`, `fulcrum doctor --fix`, and `fulcrum install plan`.

## Publishing Guidance

- Runtime-specific assets belong under `agent-integration/<runtime>/`.
- Project-local installers should copy templates instead of generating large opaque blobs.
- User-scope installers should print rollback information when they modify shared config.
- Docs must describe not just install, but upgrade, repair, and uninstall expectations for each runtime.
