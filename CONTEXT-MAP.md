# Context Map

> Index of bounded contexts. One `CONTEXT.md` per top-level subdirectory under `src/`. Each context owns its vocabulary, invariants, public surface, and ADRs. Cross-context coupling happens through the agent registry, the component catalog, and the CLI dispatcher in `src/index.ts`.

## Contexts

| Context                              | Path                  | Responsibility                                                                                  |
| ------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| [Agents](./src/agents/CONTEXT.md)         | `src/agents/`         | Canonical `Agent` interface and `AGENTS[5]` registry. Single source of truth for agent metadata. |
| [CLI](./src/cli/CONTEXT.md)               | `src/cli/`            | Command dispatch, install/uninstall, hooks, MCP, skills, packages, doctor, init.                 |
| [Components](./src/components/CONTEXT.md) | `src/components/`     | Component lifecycle engine: catalog, planner, ledger, executor, adapters.                        |
| [Hooks](./src/hooks/CONTEXT.md)           | `src/hooks/`          | Hook subcommands invoked by agent runtimes (format, lint-gate, audit-log, …).                    |
| [Repo](./src/repo/CONTEXT.md)             | `src/repo/`           | Repository supervisor scaffolding (§6.1). Migrations ship; CLI not yet wired.                    |
| [Utils](./src/utils/CONTEXT.md)           | `src/utils/`          | Shared helpers: io, proc, source-clean. No business logic.                                       |

## Cross-cutting decisions

System-wide architectural decisions live in [`docs/adr/`](./docs/adr/). Context-scoped decisions live under each context's `docs/adr/`. The seed template at `docs/adr/0000-template.md` is the canonical ADR shape.

## Conventions

- Skills consuming this map must respect the vocabulary defined in each `CONTEXT.md`. Synonyms drift; named terms do not.
- New top-level subdirectory under `src/` requires a new entry here and its own `CONTEXT.md`.
- An ADR conflict is surfaced explicitly, not silently overridden. See `docs/agents/domain.md` §"Flag ADR conflicts".
