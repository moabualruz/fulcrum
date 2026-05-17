# Fulcrum Desktop Shell

Tauri v2 native wrapper around the Fulcrum web surface (SvelteKit). Hosts the
same SvelteKit client inside a system webview, adds OS integration (native
file drag-drop, updater, future tray + notifications), and bridges privileged
filesystem work over Tauri IPC. Optional install — everything also runs in a
plain browser. Gated behind `FULCRUM_FEATURES=desktop-app`.

## Language

**DesktopShell**:
The Tauri v2 application that wraps the web surface in a native window and
exposes OS-level integrations.
_Avoid_: Electron app, native client, wrapper app.

**MainProcess**:
The Rust binary (`fulcrum_lib` / `fulcrum` bin) that owns the Tauri runtime,
window creation, plugin registration, and IPC handlers.
_Avoid_: Backend, host process, server, core.

**RendererProcess**:
The system webview instance that loads the SvelteKit client bundle
(`apps/web/.svelte-kit/output/client`) and is the user-visible UI.
_Avoid_: Frontend, browser, view, UI thread.

**IpcCommand**:
A `#[tauri::command]` function in the MainProcess invoked from the
RendererProcess via `invoke()` — e.g. `copy_artifact`, `check_for_updates`,
`check_feature_flag`.
_Avoid_: API, endpoint, RPC, handler, bridge call.

**DesktopWindow**:
A single Tauri-managed OS window declared in `tauri.conf.json` (id `main`,
1280x800, resizable, drag-drop enabled). Distinct from the SvelteKit
"surface" rendered inside it.
_Avoid_: Frame, viewport, screen.

**TauriPlugin**:
A registered Tauri v2 plugin extending the MainProcess — currently
`tauri-plugin-updater`, `tauri-plugin-dialog`, `tauri-plugin-fs`.
_Avoid_: Extension, addon, module.

**FeatureGate**:
The runtime check that reads `FULCRUM_FEATURES` (comma list) and confirms
`desktop-app` is enabled; verified at MainProcess setup and via the
`check_feature_flag` IpcCommand on RendererProcess startup.
_Avoid_: Feature flag (generic), toggle, env check.

**ArtifactCopy**:
The MainProcess flow that copies an OS-dropped file into
`FULCRUM_HOME/artifacts/` and returns an `artifact_id` + `dest_path` to the
RendererProcess, which then registers the artifact via tRPC.
_Avoid_: Upload, import, ingest.

**FulcrumHome**:
The on-disk root directory used for desktop-managed state (default
`~/.fulcrum`, overridable via `FULCRUM_HOME`). Currently houses
`artifacts/`.
_Avoid_: App data dir, home dir, workspace.

**UpdaterEndpoint**:
The remote URL pattern the Tauri updater queries
(`https://releases.fulcrum.app/{{target}}/{{arch}}/{{current_version}}`).
_Avoid_: Update server, release feed.

## Relationships

- A **DesktopShell** runs exactly one **MainProcess** which hosts one
  **DesktopWindow** containing one **RendererProcess**.
- A **MainProcess** registers many **TauriPlugins** and exposes many
  **IpcCommands** to its **RendererProcess**.
- The **RendererProcess** loads the Fulcrum web surface bundle; the web
  surface itself is owned by `apps/web`, not by this package.
- An **IpcCommand** is invoked by the **RendererProcess** and executed on the
  **MainProcess** — never the reverse.
- **ArtifactCopy** writes into **FulcrumHome**`/artifacts/` and returns an
  identifier the **RendererProcess** passes to the product DB via tRPC; the
  **MainProcess** never talks to the database directly.
- The **FeatureGate** is checked twice: once during `tauri::Builder::setup`
  (warn-only) and once via the `check_feature_flag` **IpcCommand** at
  RendererProcess startup.
- The **UpdaterEndpoint** is consumed by the `check_for_updates`
  **IpcCommand** through `tauri-plugin-updater`; the RendererProcess decides
  how/whether to surface the update to the user.

## Example dialogue

> **Dev:** "When the user drags a file onto the window, who handles it?"
> **Desktop maintainer:** "The **DesktopWindow** fires the drop event into
> the **RendererProcess**. The Svelte client calls the `copy_artifact`
> **IpcCommand**, which runs in the **MainProcess** and writes the file into
> **FulcrumHome**`/artifacts/`. Only then does the RendererProcess call
> `artifacts.create` over tRPC."
> **Dev:** "So the **MainProcess** doesn't know about artifacts as a domain
> concept?"
> **Desktop maintainer:** "Right — it only does the privileged copy. The
> artifact entity lives behind tRPC; the desktop shell is dumb about it."

## Flagged ambiguities

- "window" was used to mean both the OS-level **DesktopWindow** and the
  in-page Svelte route/layout — resolved: **DesktopWindow** is the Tauri
  window object; in-page panels are "surfaces" owned by `apps/web`.
- "shell" was used for both the **DesktopShell** (Tauri app) and the web
  surface's "scope chrome" — resolved: **DesktopShell** is this package
  only; the web chrome belongs to `apps/web`.
- "renderer" was ambiguous between the **RendererProcess** (webview) and
  Svelte SSR rendering — resolved: **RendererProcess** is always the Tauri
  webview; Svelte SSR is irrelevant inside the desktop shell because the
  bundle is the static client build.
- Native tray, OS notifications, and keychain credential storage are
  referenced in `PRODUCT.md` as part of the desktop offering but are **not
  yet implemented** here — no `tauri-plugin-notification`, no tray icon, no
  keychain plugin is wired in `Cargo.toml` / `tauri.conf.json` today. Treat
  those terms as planned, not current.
