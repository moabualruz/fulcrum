# TUI Surface (`apps/tui`)

The TUI is the keyboard-first workbench surface of Fulcrum — an OpenTUI-rendered terminal app that visualizes the same workflow stages (Capture / Plan / Build / Review / Ship / Operate) and four step modes (Manual / Play / Discuss / AI Assist) as the web shell. It is an invocation and visualization layer: every keystroke calls a shared service via the kernel (tRPC `createCallerFactory`); it owns no business logic, no persistence, and no domain rules.

## Language

**TuiScreen**:
The unit of navigation — one full-terminal view bound to a workflow-stage destination (e.g. `:board`, `:run/<id>`, `:doctor`, `:ai`).
_Avoid_: Page, View, Route, Window, Tab.

**ColonPalette**:
The modal command palette opened with `:` — k9s/Helix grammar, text-driven, tab-completes against the CLI command tree (`:run new`, `:doctor`, `:agent invoke claude`).
_Avoid_: Modal palette, command-bar, `:` prompt.

**SpaceMenu**:
The modeless action menu opened with `Space` — frecency-ranked groupings (`Space f` files, `Space r` runs, `Space t` tasks), action-oriented, closes on Esc or selection.
_Avoid_: Quick menu, drawer menu, Space palette.

**StatusFooter**:
The always-on bottom strip rendering MODE, profile, repo:branch, run id+position, agent, mcp health, trace id, clock, and the right-most `[ :ai ]` segment — single line, Lipgloss columns, never collapses.
_Avoid_: Status bar (the file is `StatusBar.ts`, but the surface term in docs/UX is StatusFooter).

**StageChord**:
The two-key navigation chord that jumps between workflow stages (`g c` Capture, `g p` Plan, `g b` Build runs, `g B` Build board, `g r` Review, `g s` Ship, `g o` Operate).
_Avoid_: Stage shortcut, g-prefix, go-key.

**ChatPane**:
The TUI-native inline `:ai` screen — the terminal-side equivalent of the web AI Assist drawer; it is a screen swap, not an overlay, with thread + composer + agent picker, auto-scoped to active step + project + trace.
_Avoid_: AI drawer, ACP panel, chat overlay, slide-over.

**AiAssistSettingsScreen**:
The `:settings ai-assist` settings screen for checkpoint mode, checkpoint retention, event transport, and session > user > org > built-in resolution.
_Avoid_: ACP settings panel, protocol config.

**ModePicker**:
The popover opened by `p` (Play) / `d` (Discuss) / `m` (mode menu) on a focused step — picks agent + model + policy before dispatching a run or thread.
_Avoid_: Agent picker (subset only), run-config modal.

**TraceYank**:
The `y` family of clipboard keystrokes — `y t` trace id, `y r` run id, `y s` span id, `y p` project path — copies the identifier from the focused row/header to the system clipboard.
_Avoid_: Copy trace, clipboard hotkey.

**StatusBadge**:
The 8-state glyph + color + label token rendered in lists and headers — `pending ◌`, `running ●`, `complete ✓`, `blocked ⏸`, `awaiting ⌛`, `failed ✗`, `cancelled ⊘`, `degraded ⚠`. Never color-only.
_Avoid_: Status pill, state chip, status icon.

**DensityMode**:
The row-height setting — Compact (1 line), Cozy (default, 1 + meta line), Comfortable (2 lines) — toggled via `:density …`.
_Avoid_: Zoom, size mode, compact toggle.

**VisualSelect**:
The `V` range-select mode borrowed from vim — extends row selection across a list for bulk actions on tasks, runs, audit rows.
_Avoid_: Multi-select, shift-select.

**ReviewChord**:
The Plannotator-verbatim review keymap — `Mod+Enter` approve, `Alt Alt` toggle destination, `Mod+B` file tree, `Mod+.` sidebar, `a` accept hunk, `r` reject hunk, `h` / `Mod+]` next hunk.
_Avoid_: Review shortcuts (too generic), diff keys.

**ScopeChip**:
The agent-scope selector at the top of `:mcp` / `:plugins` / `:agents` — filters the table to the selected CLI agent's installed set (per-agent MCP/plugin config, not global).
_Avoid_: Agent filter, scope dropdown.

**KernelCaller**:
The in-process tRPC caller (`local-caller.ts`) the TUI uses to invoke services — replaces HTTP in the TUI runtime so screens stream the same envelope as the CLI without socket overhead.
_Avoid_: API client, RPC stub.

**AutomationRulesScreen**:
The project-scoped `:automations` **TuiScreen** for listing, searching, creating, enabling/disabling, and deleting automation rules through the same work-management automation service used by CLI and web.
_Avoid_: Local rules editor, TUI-only automation state, settings table.

**ReviewHandoffScreen**:
The `:review-handoff` **TuiScreen** for the final UAT/code-review gate: shows the trace id, QA status, handoff prompt, pending review sessions, approve/request-changes/start-review decisions, and generated E2E artifacts through **KernelCaller** reports services.
_Avoid_: Web-only final gate, hidden approval action, terminal-only review state.

**UnsavedQuitConfirmation**:
The per-screen `q` guard shown only when the focused **TuiScreen** owns an unsaved draft; it renders `Unsaved edits. Quit? (y/n)` plus the exact loss hint, accepts `y` to discard/quit and `n` or Esc to stay.
_Avoid_: Generic exit prompt, always-on quit modal, shell-level dirty flag.

## Relationships

- A **TuiScreen** is identified by its `:` address (`:board`, `:run/<id>`); every CLI verb has a matching screen and vice versa (CLI↔TUI parity).
- The **ColonPalette** (`:`) tab-completes against the CLI command tree; the **SpaceMenu** (`Space`) ranks by frecency. Both can open any **TuiScreen** — they are alternate entry points, not competitors.
- A **StageChord** (`g c` / `g p` / `g b` / `g r` / `g s` / `g o`) opens the default **TuiScreen** for that workflow stage.
- The **StatusFooter** is rendered on every **TuiScreen**; its right-most segment is always `[ :ai ]`, which opens the **ChatPane**.
- The **ChatPane** is a **TuiScreen** (`:ai`) — not an overlay. Invoking it swaps the visible screen and flips `MODE` to `:AI` in the **StatusFooter**.
- A focused step row exposes **ModePicker** via `p` / `d` / `m`; dispatching a run streams updates into the same screen via the **KernelCaller**.
- **TraceYank** reads the trace id displayed in the **StatusFooter** or current header; the same id appears in the CLI `--json` envelope and the web trace badge.
- **StatusBadge** vocabulary is shared with the web shell — same 8 states, same glyphs.
- **DensityMode** applies globally across every **TuiScreen** that renders a list.
- **ScopeChip** is local to `:mcp`, `:plugins`, `:agents`, `:routes` — it does not affect other screens.
- **AutomationRulesScreen** mirrors `fulcrum automations …` CLI verbs and the web automation rule list; it must call **KernelCaller** services instead of owning rule persistence.
- **ReviewHandoffScreen** mirrors `fulcrum product reports uat-handoff`, `decision`, and `e2e-run`; decisions must carry the same trace id rendered by web final-gate badges and CLI JSON envelopes.
- **UnsavedQuitConfirmation** belongs to each dirty **TuiScreen** because draft ownership differs by screen; the shell delegates `q` first and only exits/navigates when the screen reports no unsaved draft.

## Example dialogue

> **Dev:** "If I hit `g b` and then `:`, do I get a different palette than the one in `:ai`?"
> **Domain expert:** "No — there is one **ColonPalette**, modal, same grammar everywhere. `g b` is a **StageChord** that opens the Build **TuiScreen**; `:` opens the palette on top of whatever screen you're on. `:ai` is just one screen the palette can route to."
> **Dev:** "And the AI thing on the right of the footer — is that the same drawer as the web?"
> **Domain expert:** "No, that's the **ChatPane**, a **TuiScreen** at `:ai`. The web overlays its AI Assist drawer; the TUI never overlays a terminal — it swaps screens. The `[ :ai ]` segment in the **StatusFooter** is the entry point, not a panel."

## Flagged ambiguities

- **"Screen" vs "Pane" vs "View"** — the codebase uses all three (`screens/`, `orchestrator-pane.ts`, `task-list` "view"). Resolution: **TuiScreen** is the canonical full-surface unit. "Pane" inside a screen (e.g. sessions / transcript / workspace tripane in `:plan/<id>`) is a sub-region, not a navigable destination. "View" is rejected in TUI surface vocabulary — reserved for board/list/table/calendar/gantt layout switches inside `:list`.
- **"Palette" (`:`) vs "Menu" (`Space`)** — both are command surfaces. Resolution: **ColonPalette** is modal + text-driven + CLI-grammar; **SpaceMenu** is modeless + frecency-ranked + group-prefixed. Never refer to either as "the palette" without the modifier.
- **"Drawer" vs "ChatPane"** — web docs call it the "AI Assist drawer"; the TUI must not. Resolution: in TUI context it is always **ChatPane** (or `:ai` screen). Drawer/overlay are banned for the TUI surface — the terminal never overlays.
- **"StatusBar" vs "StatusFooter"** — the widget file is `widgets/StatusBar.ts` but the UX surface term is **StatusFooter** (per CLI-TUI-UX.md §8). Resolution: keep the file name for code; use **StatusFooter** in design/UX/docs.
- **"Mode"** — overloaded. (a) workflow-stage mode shown in **StatusFooter** (CAPTURE / PLAN / RUNS / …), (b) the four step modes (Manual / Play / Discuss / AI Assist), (c) **DensityMode**, (d) vim **VisualSelect** mode. Resolution: always qualify — `StageMode`, `StepMode`, `DensityMode`, `VisualSelect` — never bare "mode".
