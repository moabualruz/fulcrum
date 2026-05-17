# Knowledge / Docs Editor, Page Tree, Attachments, Version History, Search, Memory, Context Assembly

> Research date: 2026-05-17. 25+ sources. Covers 10 platforms + memory/context patterns + provenance display.

## 1. Platform Survey

### 1.1 Notion

**Editor toolbar:** Hybrid. Desktop: `+`/`⋮⋮` hover icon per block + floating selection toolbar on highlight. No fixed top bar. Slash (`/`) is primary insertion. Mobile: fixed toolbar pinned above soft keyboard; no slash menu on mobile.

**Block types:** Text, Heading H1–H3, Bulleted/Numbered/Toggle list, To-do, Quote, Callout, Code, Table, Divider, Image, Video, Audio, File, Web Bookmark, Page link, Equation, Button, TOC. Database views (Table, Board, Calendar, Gallery) insertable as blocks. Embeds: Figma, Loom, PDF, GitHub Gist, Framer, Typeform, etc.

**Slash command:** `/` → real-time filtered list. Recent/most-used pinned at top. Keyboard ↑↓ + Enter. Esc dismisses. Fuzzy: "cod" → Code block.

**Mentions:** `@name` = person (notification) or page (inline chip). No `[[]]` syntax. Backlinks: collapsible panel below page title — default = count badge; "Expanded" = full list. Target page title renames propagate instantly to all chips.

**Attachment flows:** Paste → immediate upload with inline progress. Drag onto page → file block. Error: inline retry button in block. Max size varies by plan.

**Version history:** Page History from `…` menu. Versions listed chronologically. Diff highlights adds/removes. Restore = new revision (non-destructive). No named snapshots natively.

**Comments:** Highlight → `💬` or `Cmd+Shift+M` → thread anchored to selection. Right-side rail. Toggle Open/Resolved. `@mention` sends notification.

**Mobile:** Fixed toolbar above keyboard. Double-tap select; drag handles for cross-block selection. Autosave always on; last-edited timestamp only.

### 1.2 Docmost

Open-source (AGPL 3.0). ~19,600 GitHub stars. Self-hostable; cloud option.

**Editor toolbar:** Floating on selection. Markdown shortcuts auto-convert (e.g., `## ` → H2). Slash command for insertion.

**Block types:** Headings, paragraphs, callouts, toggle/collapsible, tables (resizable columns, mergeable cells, color fills), code, LaTeX (KaTeX), images (paste from clipboard), Draw.io / Excalidraw / Mermaid, embeds (Airtable, Loom, Miro).

**Mentions:** `@` for teammates and page links. Enterprise: resolve comment threads.

**Spaces and permissions:** Spaces = scoped containers. Permissions: Full Access / Can Edit / Can View. Groups for bulk assignment. Workspace-level + space-level hierarchy.

**Sharing / export:** Public share via link. Import/export: Markdown, HTML, ZIP, Notion import. Enterprise: Confluence, DOCX. Print to PDF.

### 1.3 Outline (getoutline.com)

**Editor toolbar:** Floating selection toolbar + slash menu. No fixed top bar.

**Slash command:** `/` → filtered + keyboard nav. Includes `/pdf` for embedded PDFs.

**Mentions:** `@user` for notifications. Page-to-page link via `@page-title`. Backlinks auto-generated.

**Version history:** Auto-recorded every 5 minutes of editing. Access: timestamp below title, doc `…` menu, or command palette "History". Sidebar lists versions. Click → diff view. Restore = new revision (non-destructive). Named snapshots in cloud/licensed editions. Delete revision for confidential-data removal.

**Comments:** Document-level and selection-level. Selection → comment icon at end of formatting toolbar. Resolvable threads. Right-rail display.

**Backlinks:** Auto-generated list at the **bottom of each document**. Real-time as other docs link in.

### 1.4 Coda

**Editor toolbar:** Floating selection + slash menu.

**Block types:** Standard prose + headings + lists. Unique: tables with `=` formula bar (full spreadsheet), Views (Kanban/Calendar/Timeline from any table), Buttons (trigger automations), Packs (live embed from external APIs — Jira, GitHub, Google Calendar).

**Doc → task:** Native — any table row can be a task. Buttons create rows + trigger automations. "Living spec" pattern: formula columns pull live issue status into the doc. Strongest doc-as-active-spec model.

### 1.5 Anytype

**Architecture:** Local-first; offline-first. P2P sync, zero-knowledge encryption. Not SaaS.

**Editor model:** Objects (not pages). Types define schema. Relations = typed bidirectional connections. Sets = live queries.

**Slash command:** `/` inside any object. Fuzzy filter.

**Doc → task:** Any object can be any type. A "Meeting Note" object holds a typed Relation to "Task" objects. Bidirectional, queryable — no external integration needed. Structurally the strongest doc-to-work model in this survey.

### 1.6 Logseq / Obsidian

**Logseq:** Outliner-first. Every line = linkable block. Opens on today's Journal page. Blocks queryable via Datalog. Unlinked references shown automatically. Weak for long-form prose. Best: daily capture + structured thinking.

**Obsidian:** Page-first. `[[PageName]]` wikilinks, `![[embed]]`, `[[Page#Section]]`. Backlinks pane in right sidebar. Graph view. Dataview plugin for queries. Tasks plugin.

**Daily notes:** Logseq Journal default landing. Obsidian Daily Notes core plugin.

**Version history:** Neither native. Filesystem/git snapshots only.

### 1.7 HedgeDoc / HackMD

**Editor toolbar:** Fixed top toolbar (Markdown format buttons + WYSIWYG toggle). Split-pane: raw Markdown + live preview. No slash menu — direct Markdown syntax.

**Block types:** All standard Markdown + tables + code fences + LaTeX + Mermaid / PlantUML / Vega-Lite + reveal.js presentations.

**Collaboration:** Real-time multi-cursor with presence indicators.

**Permissions:** Per-note: Owner / Signed-in users / Everyone.

**Strength:** Best for technical teams writing raw Markdown. Weakest UX for non-technical editors.

### 1.8 Tana / Roam Research

**Tana:** No "pages" — all content is nodes in a workspace tree. Home + Today (daily notes) + no floating pages. `@` for node linking. Supertags apply typed schema to any node (e.g., `#meeting` → gains Date, Attendees, Action Items fields). Live Search nodes = dynamic query views. Multi-view per node: table / list / columns / card. Command Palette: `Cmd/Ctrl+K`.

**Roam:** `[[Page]]` wikilinks, `((block-ref))` references. All backlinks shown below page + unlinked references. Daily notes as primary entry.

### 1.9 Linear Docs / Projects

**Philosophy:** Minimal-friction. Docs support issues/projects — not standalone knowledge base.

**Block types:** H1–H3, text, inline bold/italic/code, bullet, numbered, checklist, code block, Mermaid, table, blockquote, collapsible section, divider, date, file attachment.

**Mentions:** `@text` = unified: user / issue / project / date / document. `@ENG-123` → related-issue relation auto-created. No `[[]]` syntax.

**Doc → task:** `@ENG-123` mention in doc → issue becomes "related". Project overview = semi-structured doc with embedded issue list.

### 1.10 Slack Canvas

**Architecture:** Persistent doc embedded in a channel or workspace. Designed for discoverability within chat context.

**Block types:** Text, headings, lists, links, images, files, embedded Lists, embedded workflows, embedded canvases (nested).

**AI:** AI drafts canvas from channel conversation summary; rewrites, shortens, translates.

## 2. Universal Block Set (v1 Recommendation)

| Block | Universality |
|---|---|
| Heading H1–H3 | Universal |
| Paragraph / Text | Universal |
| Bulleted list | Universal |
| Numbered list | Universal |
| To-do / Checklist | Universal |
| Code (fenced, syntax-highlighted) | Universal |
| Quote / Blockquote | Universal |
| Callout (icon + color background) | Near-universal |
| Table | Near-universal |
| Image | Universal |
| Divider | Universal |
| File attachment | Near-universal |
| Toggle / Collapsible | Common |
| Mention (`@`) | Near-universal |
| Mermaid diagram | Common |
| Embed / URL bookmark | Common |

**Defer:** Database views, formula cells, Supertag schemas, Coda Packs.

## 3. Slash Command Best Practices

1. **Trigger:** `/` at start of empty line or after whitespace. Not mid-word.
2. **Initial state:** Top ~8 items: recent-used first, then categories (Text / Media / Structures / Embeds / Fulcrum-specific).
3. **Fuzzy filter:** As user types, filter by name + synonyms ("img" → Image, "h1" → Heading 1, "cb" → Code Block).
4. **Keyboard nav:** ↑↓ move, Enter insert, Esc dismiss.
5. **Recent-used section:** Last 4 used pinned at top.
6. **Category separators:** Visual dividers between groups.
7. **No network round-trip:** Local-only, instant.

## 4. Mention Patterns

| Syntax | Used by | Rendered as |
|---|---|---|
| `@username` | All | Avatar chip + notification |
| `@page-title` | Notion, Outline, Docmost | Inline link chip + backlink on target |
| `[[Page Name]]` | Obsidian, Roam, Logseq | Wikilink; bidirectional backlink |
| `@ENG-123` | Linear | Issue chip; relation auto-created |
| `#tag` | Logseq, Tana | Tag anchor / Supertag trigger |
| `@Oct 1` | Linear | Date chip |

**Fulcrum unification:** `@` as universal dispatch prefix. Resolver order: user → page/doc → task/issue → run → date. Disambiguation popover on ambiguous match.

## 5. Attachment Flows (Best Practice)

1. **Entry:** Paste (Ctrl+V), drag-onto-page, slash `/file` or `/image`.
2. **Inline progress:** Progress bar within the block itself (not global toast). "Uploading 47%…" label.
3. **Error recovery:** Inline retry button in block. Specific error: "File too large (max 10 MB)" not "Upload failed". Block persists as placeholder on failure.
4. **Max size signal:** Show max size in drag-target placeholder before drop.
5. **Image paste:** Immediate placeholder → spinner → rendered image on completion.
6. **Undo:** Ctrl+Z removes in-progress upload block.

## 6. Version History Patterns

| Platform | Auto-record interval | Compare | Restore | Named snapshots |
|---|---|---|---|---|
| Outline | Every 5 min editing | Diff view | New revision | Cloud/licensed |
| Notion | Per edit session | Side-by-side diff | New revision | Not native |
| Docmost | Per edit | Listed | Supported | Not documented |
| HedgeDoc | Auto-saved | Revert | Yes | No |
| Linear | Not first-class | — | — | — |

**Fulcrum recommendation:** Record on: (a) 2-min idle, (b) explicit save, (c) session end. Diff = character-level. Restore = new revision (non-destructive). Named snapshots: user renames any version. Delete revision for GDPR/confidential data.

## 7. Comments: Inline, Side Rail, Resolve

- **Selection → comment:** Highlight → `💬` icon or keyboard shortcut → thread anchored to selection. Pin/icon in right margin.
- **Side rail:** All threads in right-side drawer. Toggle Open / Resolved tabs.
- **Resolve:** Checkbox/tick → moves to Resolved (not deleted). Audit-accessible.
- **Mention-on-comment:** `@user` → notification.
- **Nested replies:** Sub-replies indented within thread.

## 8. Backlinks / Referenced-By

| Platform | Placement | Update | Unlinked mention detection |
|---|---|---|---|
| Notion | Top of page (below title) | Real-time | No |
| Outline | Bottom of document | Real-time | No |
| Obsidian | Right sidebar pane | On open/save | Yes |
| Logseq | Bottom of page | Real-time | Yes (prominent) |
| Anytype | Graph view + Relations | Real-time | Via search |

**Fulcrum recommendation:** Bottom of doc "Referenced by" section. Count badge near title. Real-time via WebSocket. Collapse by default (expand on click). No unlinked-mention detection in v1.

## 9. Doc → Task / Doc → Run Linkage

1. **Mention-to-relation (Linear):** `@TASK-123` in doc → relation auto-created. Chip shows status + assignee.
2. **Relation property (Anytype/Coda):** Typed relation on the doc object pointing to Tasks. Bidirectional + queryable.
3. **Selection-to-create (gap in all current tools):** Highlight text → "Create task from selection" → pre-fills task title with selection, links back to doc + scroll anchor.
4. **Embed view (Notion/Coda):** `/embed-tasks` inserts live-filtered issue list inside doc.

**Fulcrum recommendation:** Implement patterns 1 + 3. `@RUN-456` mentions in docs create run relations. "Create task from selection" = right-click context menu on highlight.

## 10. Mobile Editor

- **Fixed toolbar above soft keyboard.** Not floating — conflicts with keyboard. Buttons: Bold, Italic, Link, `@`, block-type switcher, image.
- **No slash command on mobile.** Block type via dedicated toolbar button.
- **No horizontal scroll.** Tables degrade to scrollable cards on narrow viewport.
- **Autosave indicator:** "Saved just now" or relative timestamp. 3-second pause → save trigger. "Saving…" spinner during upload.
- **Tap-to-select:** Double-tap word → word selected. Drag handles for cross-block extension.

## 11. Memory / Context Assembly for AI Agents

### 11.1 Cline Memory Bank (Community pattern; widely adopted 2024–2025)

```
memory-bank/
  projectbrief.md      — source of truth, foundation
  productContext.md    — why the project exists
  systemPatterns.md    — architecture decisions
  techContext.md       — stack, setup, env
  activeContext.md     — current focus / open threads
  progress.md          — status, milestones
```

On session start: read all files + verify context complete. After significant changes: update relevant files before session end. Plain Markdown, git-tracked, human-readable. **Critical rule:** Only tool-verified or user-confirmed facts enter memory. Model-generated inferences never stored. Prevents hallucination loops.

### 11.2 Cursor Rules

Saved prompt files (`.cursorrules` at project root or `~/.cursor/rules/`). Injected as system context on every request. Tiered: global → project → file-scoped.

### 11.3 Five-Tier Memory Architecture (Convergent across research)

| Tier | Scope | Contents | TTL |
|---|---|---|---|
| Working | In-session scratchpad | Plans, partial thoughts | 30–120 min |
| Episodic | Write-once log | Events, timestamps, tool outcomes | Months–years |
| Semantic | Durable knowledge | Facts, FAQs, verified entities | Until contradicted |
| Procedural | Versioned how-to | Runbooks, playbooks, tool schemas | Manual update |
| Preference | User/org-bound | Style, constraints, data-sharing rules | User-managed |

**Context assembly structure (per agent step):**
1. Objective (1–2 lines)
2. Constraints (bullets)
3. State (typed JSON/YAML — not narrative)
4. Evidence (retrieved snippets, marked untrusted)
5. Action request + output schema

**Promote-to-memory gate:** Only promote when: (a) tool-verified OR (b) user-confirmed. Claims carry: text, evidence pointer, scope, confidence (0–1), TTL. Never store model speculation.

**Anti-patterns to avoid:**
- Summary drift: compressing uncertainty into certainty during summarization
- Schema-free memory: free-form notes enable retrieval contradictions
- Temporal inversion: stale cached summary overwriting fresh tool-verified state

### 11.4 Anthropic Memory Tool (Beta, 2025)

Client-side tool: Claude creates/reads/updates/deletes files in `/memories` directory via tool calls. Designed for long-running workflows with context compaction. Internal eval: 39% improvement on agentic search tasks; 84% token reduction on 100-turn evaluations.

## 12. Provenance Display

### 12.1 Glean Deep-Linked Citations (Q4 2025 — state of the art)

- Inline numbered markers (`[1]`, `[2]`) within answer text.
- **Hover preview:** highlights the exact text snippet from the source doc + surrounding context.
- **Source preview modal** before clicking through ("confirm you're looking at the right place").
- **Deep-linked navigation:** jump to specific slide / page number within the source.
- **Native app handoff:** opens in Google Drive / Confluence / SharePoint.
- **Access-controlled:** citations respect existing document permissions.
- Key insight: **text-level attribution, not document-level.**

### 12.2 Design Principles for Provenance

1. **Atomic claim + evidence pointer.** Each claim paired with specific doc snippet, not just title.
2. **Access-controlled.** Only show sources the current user can access.
3. **Date + confidence signal.** "This fact came from [Doc X] on [2025-03-12]" enables staleness detection.
4. **Preview before navigation.** User sees snippet before opening full source (Glean modal pattern).

## 13. Promote-to-Memory Patterns

1. **Ephemeral → structured field promotion:** Repeatedly confirmed preferences graduate from free-form notes to typed schema fields.
2. **Confidence threshold gate:** Promote only when confidence > threshold AND corroboration count > 1.
3. **User-triggered promotion:** "Save as rule" / "Remember this" on any message or doc block. One click → pre-filled memory form.
4. **Audit trail:** Every promoted memory retains pointer to source event/doc/session.
5. **Decay + review:** Promoted memories have review dates. "Needs review" list surfaces expired items.

## 14. Concrete Recommendations for Fulcrum

### 14.1 Web Docs Surface

**Editor:**
- Floating selection toolbar: Bold, Italic, Code, Link, Comment, `@` mention.
- Slash command (`/`): all block insertions. Fuzzy-filtered. Recent-used (4 items) at top. Categories: Text / Structures / Media / Embeds / Fulcrum (Run, Task, Memory).
- Block set v1: H1–H3, paragraph, bullet, numbered, todo, code (syntax-highlight), quote, callout, divider, table, image, file, mention, toggle, Mermaid.
- Autosave: 3-second idle → save. Indicator: "Saved just now" timestamp. Ctrl+S as convenience shortcut.
- Mobile: fixed toolbar above keyboard; no slash menu; block-type selector button in toolbar.

**Backlinks:** "Referenced by" collapsible section at bottom. Count badge near title. Real-time WebSocket.

**Comments:** Selection → `💬` → thread pinned to right rail. Resolve → Resolved tab (not deleted). `@mention` notifies.

**Version history:** 5-min auto-snapshot + "Create snapshot" (optional name). Character-level diff view. Restore = new revision.

**Doc → task / run linkage:**
- `@TASK-123` / `@RUN-456` → relation auto-created; chip shows status.
- Right-click selection → "Create task from selection" → pre-fill title + source anchor.
- `/embed-run` or `/embed-tasks` slash command → live-filtered list block.

### 14.2 CLI Doc Commands

```
fulcrum doc list [--space <space>] [--search <q>]
fulcrum doc show <id-or-slug>          # Markdown rendered
fulcrum doc edit <id-or-slug>          # opens $EDITOR; syncs on save
fulcrum doc create --title "..." [--space <space>]
fulcrum doc attach <id> <file>
fulcrum doc history <id>               # list versions + diffs
fulcrum doc restore <id> --version <n>
fulcrum doc link <doc-id> --task <task-id>
fulcrum doc search <query>             # full-text; id + title + snippet
```

### 14.3 TUI Doc Reader

- Left pane: collapsible page tree (space → docs). Keyboard nav: j/k, Enter, `o` expand.
- Center pane: rendered Markdown with ANSI colors. Heading levels visually distinct. Code blocks via bat.
- Right pane (toggle `b`): "Referenced by" backlinks list.
- Bottom bar: title + autosave timestamp + word count.
- Version diff (`v`): version sidebar + difftastic-style diff in center.
- Comments (`c` on paragraph): thread for that block.

### 14.4 Memory Review Screen

Route `/memory` (web) + `fulcrum memory list` (CLI):

- Table: Claim | Tier | Source doc/session | Confidence | Date promoted | Expires.
- Filters: tier, staleness (promoted > N days), confidence < threshold.
- Row actions: "Still valid" (reset review date), Edit, Delete, "View source" (opens provenance chain).
- "Needs review" badge count in nav for overdue memories.
- **Promote flow:** any doc block → right-click → "Add to memory" → pre-filled form (claim, tier, TTL). Requires confirmation.

### 14.5 Context Preview Screen

Route `/context-preview` (web) + `fulcrum context show` (CLI):

Shows exactly what will be assembled for the next agent run:

- Ordered list: Memory rules → Active task state → Referenced docs → Attached files → Recent session events.
- Per item: source, estimated tokens, include/exclude toggle, date.
- Provenance chip: click → opens source at exact anchor.
- Token budget bar: visual fill, current total vs model limit.
- "Simulate context" button: assembles and shows final prompt preamble for inspection before run.

## Sources

- [Notion writing & editing basics](https://www.notion.com/help/writing-and-editing-basics)
- [Notion links & backlinks](https://www.notion.com/help/create-links-and-backlinks)
- [Notion comments & mentions](https://www.notion.com/help/comments-mentions-and-reminders)
- [Notion block basics](https://www.notion.com/help/guides/block-basics-build-the-foundation-for-your-teams-pages)
- [Docmost GitHub](https://github.com/docmost/docmost)
- [Outline revision history](https://docs.getoutline.com/s/guide/doc/revision-history-AiL6p22Ssq)
- [Outline commenting](https://docs.getoutline.com/s/guide/doc/commenting-z7eSWvI5TI)
- [Anytype blocks docs](https://doc.anytype.io/anytype-docs/getting-started/object-editor/blocks)
- [Anytype relations](https://doc.anytype.io/anytype-docs/basics/relations)
- [Linear editor docs](https://linear.app/docs/editor)
- [Linear project documents](https://linear.app/docs/project-documents)
- [Cline Memory Bank blog](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets)
- [Cline Memory Bank docs](https://docs.cline.bot/features/memory-bank)
- [Context Engineering in Agent (Medium)](https://medium.com/agenticais/context-engineering-in-agent-982cb4d36293)
- [Glean citations](https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/glean-citations)
- [Glean deep-linked citations](https://developers.glean.com/guides/chat/deep-linked-citations)
- [Slack Canvas](https://slack.com/features/canvas)
- [HedgeDoc features](https://demo.hedgedoc.org/s/features)
- [Tana: Roam user guide](https://outliner.tana.inc/articles/roam-user-s-guide-to-tana)
- [File uploader UX best practices](https://uploadcare.com/blog/file-uploader-ux-best-practices/)
- [Autosave UX design](https://uxdesign.cc/designing-a-user-friendly-autosave-functionality-439f2fe4222d)
- [Anthropic Memory Tool announcement (2025)](https://www.anthropic.com/news/agent-skills)
