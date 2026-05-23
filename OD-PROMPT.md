# OD-PROMPT.md — Open Design prompt for Fulcrum hi-fi prototype

> Paste the prompt block below into Open Design (running locally, https://open-design.ai/) inside the existing project named **fulcrum**. Open Design will read the linked files via its MCP and produce a hi-fi interactive prototype that this conversation can then iterate on through /impeccable + the Open Design MCP.

---

## How to use this file

1. Open the **fulcrum** project in Open Design on your machine.
2. Paste the **PROMPT BLOCK** below into Open Design's prompt input.
3. Open Design will fetch the linked files from this repository (PRODUCT.md, DESIGN.md, IA-MAP.md, COPY.md, the 7 research files, the 1281-entry prd.jsonl glossary) through its MCP and produce the first hi-fi pass.
4. Once results are visible, ping back here. The Claude Code MCP-bound design tools will:
   - Use `mcp__open-design__get_artifact` to pull the rendered HTML/JSX/CSS bundle.
   - Run `/impeccable critique` against the result, scored against the design laws in this repo.
   - Iterate via `/impeccable polish`, `/impeccable adapt`, `/impeccable harden`, `/impeccable animate` etc., feeding diffs back into Open Design.
5. Lock visual decisions into DESIGN.md as the design system stabilizes.

---

## PROMPT BLOCK (copy from here)

```
You are designing a hi-fi interactive prototype for Fulcrum, a local-first Agent OS for supervising agent-managed product work across web + CLI + TUI + API. The prototype must be production-grade, not a marketing landing page. Read every file below from the user's local repo via the MCP before producing anything.

REGISTER: product (impeccable register). Design SERVES the workbench. Brand register is reserved for a marketing landing page, kept separate.

REQUIRED READS (verbatim sources of truth — do not invent, do not skip):

  1. /Users/mkh/workspace/fulcrum/PRODUCT.md
       — What Fulcrum is, target users, voice, anti-references, surface map, workflow stages, scope chrome, agent identity, per-step modes, onboarding, failure-pattern bans.
  2. /Users/mkh/workspace/fulcrum/DESIGN.md
       — Design tokens (OKLCH), semantic color roles, typography, spacing, breakpoints, component vocabulary, motion, iconography, density modes, live session pane, run feed, doctor/audit, what-we-will-not-build, cross-surface invariants.
  3. /Users/mkh/workspace/fulcrum/IA-MAP.md
       — Route tree, sidebar IA, keyboard map, ACP drawer behavior, command palette, status footer, CLI subcommand tree, TUI screen list, mobile IA, trace-spine.
  4. /Users/mkh/workspace/fulcrum/COPY.md
       — Voice rules, empty-state copy, error template, mode affordance copy, doctor copy, permission prompts, status labels.
  4b. /Users/mkh/workspace/fulcrum/CLI-TUI-UX.md
       — Full CLI subcommand tree (six workflow stages), JSON envelope, flag standards, completion, error codes, TUI screen list, keyboard map, status footer (mirror of web), command palette, ACP chat pane, CLI↔TUI parity table.
  5. local research dossier (01-workflow-nav-ia)
  6. local research dossier (02-agent-supervision)
  7. local research dossier (03-knowledge-docs-memory)
  8. local research dossier (04-observability-trace)
  9. local research dossier (05-cli-tui-design)
 10. local research dossier (06-mobile-a11y-perf-tokens)
 11. local research dossier (07-copy-first-parity)
 12. local PRD glossary
       — 1281-entry NDJSON PRD glossary. Treat as canonical user-value requirements. Sample 30+ entries to verify your design honors them.

CORE PRINCIPLES (lifted verbatim from PRODUCT.md; do not soften):

  • Workflow-stage primary navigation: Capture → Plan → Build → Review → Ship → Operate. Never feature-bucket nav.
  • Every step in every stage exposes four modes: Manual freeform / ▶ Play (handoff to AI) / 💬 Discuss (inline thread) / ⊞ ACP chat panel (pullable right drawer). Docs are NOT special; they obey the same modes.
  • Prototyping lives inside Plan. Plan output = plan + prototype callouts + task breakdown, reviewed together.
  • Trace ID visible + copyable on every surface (web pill, CLI envelope, TUI footer segment). Click anywhere = jump to trace explorer.
  • Production-grade quality bar. Linear density + k9s status-spine + Plane multi-layout + Plannotator review surface + ACP-UI protocol clarity.
  • Mobile parity. Touch ≥ 44×44 under `(pointer: coarse)`. WCAG 2.2 AA contrast 4.5:1.
  • Local-first. Boots cold ≤ 5s. Offline-capable for safe operations.

ABSOLUTE BANS (drawn from PRODUCT.md and DESIGN.md §12 — match-and-refuse):

  • SaaS dashboard cream (Stripe Atlas / Notion onboarding gradients, big hero stat cards). BAN.
  • "AI" tropes: neon purple/pink gradients, glowing orbs, ✨ AI badges, animated typing dots. BAN.
  • Crypto neon-on-black, hex glyphs. BAN.
  • Linear-clone teal sidebar (pixel-perfect copy). BAN — borrow density + keyboard ethos, not palette.
  • Notion-clone slash-everywhere prose theatre (pastel callouts, breadcrumb chains). BAN.
  • Salesforce / Jira ribbon density. BAN.
  • Hero-metric card grids (4 cards big number small label). BAN.
  • Modal-first design (task create, planning start, run dispatch as modals). BAN.
  • Coloured side-stripe borders > 1px on cards/lists. BAN.
  • Gradient text. BAN.
  • Default glassmorphism. BAN.
  • Decorative motion. BAN.
  • Generic 500 errors, "Something went wrong", "Oops!", "Please try again". BAN.
  • Em dashes anywhere in copy. BAN.

PALETTE + TOKENS:

  Use exactly the OKLCH semantic roles in DESIGN.md §1. Render dark theme by default but build a light theme that flips cleanly via `.dark` removal. One accent (cool blue, hue 250°) used only for primary action, current selection, focus ring, state indicators. Status colors: success (green ~145°), warn (yellow ~80°), danger (red ~27°). Eight-state status badge vocabulary in DESIGN.md §4.9 is locked.

TYPOGRAPHY:

  Inter for UI text. Geist Mono for trace IDs, code, JSON, status footer. 13 px default body (Linear-grade density). Fixed rem scale (DESIGN.md §2.1).

LAYOUT SHAPE TO RENDER:

  1. Web shell (desktop ≥ lg, 1440 viewport):
     • 32 px scope bar (workspace · project path · stage tabs · trace ID badge · drawer pull · ⌘K · bell · avatar).
     • Left stage rail (Capture / Plan / Build / Review / Ship / Operate) + portfolio + system groups.
     • Stage content area.
     • Right-side ACP chat drawer (initially closed; show it open in at least one frame).
     • 28 px status footer (mirrors TUI footer exactly).
  2. Mobile shell (xs portrait, 390 viewport):
     • 40 px scope bar collapsed.
     • Bottom tab bar (6 stages).
     • ACP drawer as bottom sheet.
  3. TUI capture (rendered as a stylized terminal frame — monospace, 8-color base):
     • Status footer with mode pill, profile, repo:branch, run id + position, agent, mcp health, trace ID, clock, ?, :.
     • One sample screen (e.g. `:runs` live agent session).

FRAMES TO PRODUCE (each as its own page in the prototype; route names in IA-MAP.md):

  A. Web — Capture freeform doc editor with slash menu open + ▶ Play / 💬 Discuss buttons visible per block.
  B. Web — Plan live ACP planning session (3-column live session pane: sessions list, transcript + sticky plan strip, workspace dock with Shell/Files/Browser/Plan/Cost tabs).
  C. Web — Plan review tripane (plan markdown + prototype callout interactive demo + task breakdown side-by-side, single approve gate at bottom).
  D. Web — Build board view (Plane-style five-layout switcher, board with cycle/module filter chips, per-card status badges + ▶ Play affordance).
  E. Web — Build dependency graph (Sugiyama layered, status-coloured nodes, chain highlight on hover).
  F. Web — Build runs feed with one selected run expanded into live session pane (ACP tool-call cards with collapsed/expanded states; inline file diff with per-hunk accept/reject; inline permission prompt).
  G. Web — Review workbench (file tree, diff viewer, annotation sidebar, bottom dock with PR Comments/Checks/Summary/Logs/Suggestions tabs, Mod+Enter hint).
  H. Web — Ship artifacts list with peek-overview modal slid over.
  I. Web — Operate doctor subsystem table (one row Degraded with recovery copy and Probe button + telemetry row).
  J. Web — ACP chat drawer fully expanded showing agent picker, trace ID badge, transcript with tool-call cards, composer with ▶ Run / 💾 Save thread.
  K. Mobile — Capture single column with bottom tab bar.
  L. Mobile — Build run feed with run row tapped → bottom sheet detail.
  M. TUI — `:runs` screen with status footer fully populated.
  N. Web — Empty state across stages (one composite frame showing each empty state per template).
  O. Web — Error state showing inline 5xx with trace ID + Retry button.
  P. Web — Onboarding first-Play coachmark.
  Q. Web — Command palette ⌘K open with step-action section visible.

INTERACTIVE BEHAVIORS TO PROTOTYPE:

  • Stage tab strip in scope bar swaps content area (G keystroke chord `g c / g p / g b / g r / g s / g o`).
  • Drawer toggle (⌘/) collapses / expands right rail.
  • ⌘K opens palette overlay.
  • Trace ID pill click copies to clipboard + flash feedback.
  • Per-step ▶ Play opens mode picker popover with agent/model/policy selectors.
  • Per-step 💬 Discuss opens inline thread anchored to the step.
  • Dark / light theme toggle in settings (`.dark` class flip on root).
  • Density mode toggle (compact / cozy / comfortable) changes row heights and base font size.
  • Reduced-motion query collapses motion (demonstrate by toggling).

KEYBOARD MAP (use IA-MAP.md §4 as canonical):

  Render an in-prototype `?` overlay listing all keys. Include global nav (`g c/p/b/r/s/o`), list nav (`j/k`, `gg/G`, `Enter`), per-step modes (`p`, `d`, `m`), review (`Mod+Enter`, `Alt Alt`, `V`, `Mod+B`, `Mod+.`), and editor (`/`, `@`, `Mod+B/I/U`).

COMPONENT SHAPES (use DESIGN.md §4 as canonical):

  • Buttons: 5 variants (primary/secondary/ghost/danger/link), 4 sizes, 7 states.
  • Forms: 28 px input height, label above, inline error below, no toasts on validation.
  • Tables: 24 px row default, sticky header, resizable + reorderable + sortable columns, peek-overview on row click, bulk action ribbon when selected.
  • Cards (board): min 80 px height, status badge top-right, title + meta + avatars + per-step mode row.
  • Tool-call card: name + status badge + copy + expand; expanded shows args + result + inline diff if file edit.
  • Trace-ID badge: 24 px pill, mono, 8-char prefix + ellipsis, copy on click.
  • Per-step mode row: ▶ Play / 💬 Discuss / ⋮ More / ⊞ Drawer affordances inline on every step header.
  • Empty state: icon + one sentence + one button.
  • Status badge vocabulary: 8 states (pending / running / complete / blocked / awaiting / failed / cancelled / degraded / unknown), color + icon + text — never color alone.

ACCESSIBILITY:

  • All interactive elements have aria-label + data-fulcrum-* selector for agent automation.
  • Focus visible only when keyboard-engaged.
  • Tap target ≥ 24 px CSS px floor on desktop, ≥ 44×44 under (pointer: coarse).
  • WCAG 2.2 AA contrast.
  • Live regions for streamed agent output (aria-live="polite", throttled).
  • Drag-and-drop has keyboard alternative (Space to grab, j/k/h/l to move).
  • `prefers-reduced-motion` + `forced-colors` overrides demonstrated.

NON-NEGOTIABLES (drawn from cross-surface invariants in DESIGN.md §13):

  1. Trace ID visible + copyable on every surface.
  2. Project + stage visible at chrome level (NOT in breadcrumbs).
  3. Four-mode affordance per step (Manual / Play / Discuss / ACP drawer).
  4. Command palette parity (⌘K web, : TUI).
  5. Status vocabulary identical across surfaces.
  6. Empty states identical structure (one sentence + one action).
  7. Error template: `[what failed]. [why]. [next step]. trace=<id>`.
  8. ACP chat reachable in one keystroke from anywhere (⌘/).

REJECT-IF-DETECTED ZONE (your output will be rejected and asked to redo if any of the following appear):

  • Sidebar groups by feature ("Tasks / Docs / Runs / Settings") instead of workflow stage. REJECT.
  • A trace ID in a UI without copy affordance. REJECT.
  • A modal as the default response to "create task" or "start planning" or "dispatch run". REJECT.
  • Color-only status (no icon, no text label). REJECT.
  • An "AI" sparkle, glow, or purple gradient anywhere. REJECT.
  • Any em dash in copy. REJECT.
  • A hero-stat 4-card grid on Dashboard. REJECT.
  • An illustration in any empty state. REJECT.
  • A toast for an error. REJECT.

DELIVERABLE FORMAT:

  Single artifact bundle in the fulcrum project, with one entry HTML + sibling JSX modules + CSS variables compiled from DESIGN.md §1 token JSON. Use container queries for components that render in narrow and wide contexts. Bundle the keyboard cheatsheet overlay as `KbdHelp.jsx`. Ensure the layout-shape frames (A-Q above) are each accessible via in-prototype tab nav. Treat the entry as an SPA so theme + density toggles apply across frames.

REVIEW CRITERIA Open Design self-applies before returning:

  1. Workflow-stage nav is present and pixel-correct per IA-MAP.md §3.
  2. Scope chrome appears on every frame.
  3. ▶ Play and 💬 Discuss affordances visible on every step header in at least 5 frames.
  4. Trace ID badge visible + copyable in every frame.
  5. Status footer mirrors between web frame M and TUI frame.
  6. No banned visual moves (recheck the ban list above frame-by-frame).
  7. Mobile frames respect tap target floor.
  8. Dark + light theme both produced.
  9. Empty state in at least one frame matches COPY.md §2 template.
 10. Error state in at least one frame matches COPY.md §3 template.

When done, return the entry HTML path and a 200-word self-critique flagging any place the prototype deviated from this brief.
```

(end of PROMPT BLOCK)

---

## Iteration loop — once Open Design returns

After Open Design lands the first hi-fi, this conversation iterates via:

```
/impeccable critique
/impeccable adapt mobile
/impeccable harden
/impeccable polish
/impeccable animate drawer
/impeccable colorize accent
/impeccable layout density
/impeccable clarify copy
```

Each cycle pulls the OD artifact via `mcp__open-design__get_artifact`, runs the named impeccable command, writes back proposed edits as a patch file in `local OD iterations dir`, and asks you to apply via Open Design's "apply changes" affordance.

Lock decisions into DESIGN.md / IA-MAP.md / COPY.md as they stabilize so future iterations stay grounded.

---

## File index (paste into Open Design with prompt)

| Path | Purpose |
|---|---|
| `/Users/mkh/workspace/fulcrum/PRODUCT.md` | What Fulcrum is |
| `/Users/mkh/workspace/fulcrum/DESIGN.md` | Tokens, components, motion |
| `/Users/mkh/workspace/fulcrum/IA-MAP.md` | Routes, IA, keyboard, drawer |
| `/Users/mkh/workspace/fulcrum/COPY.md` | Voice + copy templates |
| `/Users/mkh/workspace/fulcrum/CLI-TUI-UX.md` | CLI subcommand tree, JSON envelope, flags, completion, TUI screens, keymap, status footer, palette, ACP chat pane, parity table |
| `local research dossier (01-workflow-nav-ia)` | Workflow-stage IA research |
| `local research dossier (02-agent-supervision)` | Live session pane research |
| `local research dossier (03-knowledge-docs-memory)` | Editor / memory research |
| `local research dossier (04-observability-trace)` | Doctor / audit / trace research |
| `local research dossier (05-cli-tui-design)` | CLI / TUI research |
| `local research dossier (06-mobile-a11y-perf-tokens)` | Mobile / a11y / tokens research |
| `local research dossier (07-copy-first-parity)` | Plane/Docmost/Fusion/Plannotator/ACP-UI parity audit |
| `local PRD glossary` | 1281-entry PRD glossary (sample 30+ entries) |
