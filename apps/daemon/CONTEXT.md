# Daemon Context

## Language

- Daemon: the long-running local Fulcrum process started as `fulcrumd`.
- Daemon home: the `FULCRUM_HOME` directory, defaulting to `~/.fulcrum`, where process marker files live.
- Pidfile: the `daemon.pid` marker containing the active daemon process id.
- Socket marker: the `daemon.sock` marker that reserves the local daemon endpoint name.
- Event transport: the platform-core transport selected before the Nest server starts.

## Relationships

- `apps/daemon/src/index.ts` is the daemon binary entrypoint and exports `startFulcrumDaemon`.
- The daemon starts `apps/server` through `startFulcrumNestServer`; server modules own API composition and business behavior.
- Event transport resolution comes from `services/platform-core/application/event-bus`.
- CLI, TUI, web, and desktop surfaces may connect to daemon-backed server behavior, but this app owns only process lifecycle and local marker files.
- Runtime state owned by bounded services stays under `services/**`; daemon code must not add persistence, routing, or domain logic.

## Example dialogue

- "Need to change how the local process writes `daemon.pid`." "Edit `apps/daemon/src/index.ts`; keep service behavior in server or platform-core."
- "Need a new task scheduling rule." "Add it to the owning service, not the daemon entrypoint."
- "Need CLI to discover a running daemon." "Read the daemon marker contract; do not duplicate daemon startup logic in CLI."

## Flagged ambiguities

- `daemon.sock` is currently a marker file, not a real Unix domain socket. Rename or replace it when daemon IPC becomes real.
