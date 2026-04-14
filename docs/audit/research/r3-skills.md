# R3 — Skills file structure, scripted skills, best practices

Research conducted 2026-04-14 for the Fulcrum / PI skills audit.
Primary sources: Claude Code docs (`code.claude.com/docs/en/skills`), the
`agentskills.io` open specification, the `anthropics/skills` reference
library, the `obra/superpowers` community library, `trailofbits/skills`,
the Anthropic engineering blog, and comparison docs for Cursor, GitHub
Copilot, and literate-devops tools (mdsh, Runme, Runbook.md).

---

## 1. Claude Code Skills — official spec

### 1.1 What a skill is

From [Extend Claude with skills](https://code.claude.com/docs/en/skills):

> Skills extend what Claude can do. Create a `SKILL.md` file with
> instructions, and Claude adds it to its toolkit. Claude uses skills
> when relevant, or you can invoke one directly with `/skill-name`.
>
> Create a skill when you keep pasting the same playbook, checklist, or
> multi-step procedure into chat, or when a section of CLAUDE.md has
> grown into a procedure rather than a fact. Unlike CLAUDE.md content,
> a skill's body loads only when it's used, so long reference material
> costs almost nothing until you need it.

Three things to notice here:

1. The unit of a skill is a **filesystem directory** containing a
   `SKILL.md` (plus optional supporting files), not a single file.
2. A skill is **dual-invokable**: Claude can auto-load it based on
   `description`, or the user can type `/skill-name` directly. The
   default is both; two frontmatter flags narrow that.
3. Skills have replaced the older `.claude/commands/` format.
   `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md`
   produce the same `/deploy`. Commands keep working but skills are
   the recommended path because they can ship supporting files.

Claude Code's skills follow the open
[Agent Skills specification](https://agentskills.io/specification)
and extend it with invocation control, subagent execution, and dynamic
context injection.

### 1.2 Frontmatter reference (Claude Code extension of the open spec)

The full field list, verbatim from the docs, is:

| Field                      | Required    | Purpose |
| -------------------------- | ----------- | ------- |
| `name`                     | No (defaults to directory name) | Display name / slash-command. Lowercase letters, numbers, hyphens only, max 64 chars. |
| `description`              | Recommended | "What the skill does and when to use it. Claude uses this to decide when to apply the skill. If omitted, uses the first paragraph of markdown content. Front-load the key use case: the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing to reduce context usage." |
| `when_to_use`              | No | Additional trigger phrases / example requests, appended to `description`, counts toward the same 1,536-char cap. |
| `argument-hint`            | No | Autocomplete hint, e.g. `[issue-number]` or `[filename] [format]`. |
| `disable-model-invocation` | No | `true` → only the user can invoke. Claude won't load it automatically. Use for side-effecting workflows: `/deploy`, `/commit`, `/send-slack-message`. |
| `user-invocable`           | No | `false` → hidden from the `/` menu, Claude-only. Use for background knowledge like a `legacy-system-context` skill. |
| `allowed-tools`            | No | Tools Claude may run without per-use approval while the skill is active. Space-separated string or YAML list. |
| `model`                    | No | Model override while the skill is active. |
| `effort`                   | No | Effort level while active: `low`, `medium`, `high`, `max` (Opus 4.6). Overrides session. |
| `context`                  | No | Set to `fork` to run the skill body in a forked subagent context. |
| `agent`                    | No | Which subagent type when `context: fork` is set (e.g. `Explore`, `Plan`, `general-purpose`). |
| `hooks`                    | No | Hooks scoped to this skill's lifecycle. |
| `paths`                    | No | Glob patterns limiting when the skill is auto-activated. Accepts a comma-separated string or YAML list. |
| `shell`                    | No | `bash` (default) or `powershell` for inline `` !`<cmd>` `` blocks. |

The open `agentskills.io` spec has a much smaller surface:

| Field            | Required | Notes from spec |
| ---------------- | -------- | --------------- |
| `name`           | **Yes**  | Max 64, lowercase-alnum-hyphen, no leading/trailing/double hyphens, **must match parent directory name**. |
| `description`    | **Yes**  | Max 1024 chars, "should describe both what the skill does and when to use it". |
| `license`        | No       | License name or reference to a bundled file. |
| `compatibility`  | No       | ≤500 chars, environment requirements (product, system packages, network). |
| `metadata`       | No       | Arbitrary string→string mapping for client-specific extensions. |
| `allowed-tools`  | No       | Experimental. "Space-separated string of tools that are pre-approved to run." |

**Reconciling the two:** Claude Code is a superset. A skill that
targets only Claude Code can use any field above; a skill that wants
to work on any `agentskills.io`-compatible agent should restrict
itself to the short list and treat everything else as Claude-specific
extension. The two lists agree on `name`, `description`, and
`allowed-tools`. Claude Code's optional fields (`when_to_use`,
`disable-model-invocation`, `user-invocable`, `paths`, `hooks`,
`context`, `agent`, `effort`, `model`, `shell`, `argument-hint`) are
all Claude-specific and should be ignored by other runtimes.

### 1.3 Directory layout

From the spec:

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
└── ...               # Any additional files or directories
```

Claude Code adds two conventions on top:

```
my-skill/
├── SKILL.md           # Main instructions (required)
├── template.md        # Template for Claude to fill in
├── examples/
│   └── sample.md      # Example output showing expected format
└── scripts/
    └── validate.sh    # Script Claude can execute
```

> The `SKILL.md` contains the main instructions and is required. Other
> files are optional and let you build more powerful skills: templates
> for Claude to fill in, example outputs showing the expected format,
> scripts Claude can execute, or detailed reference documentation.
> Reference these files from your `SKILL.md` so Claude knows what they
> contain and when to load them.

The crucial rule: **reference supporting files from SKILL.md** so the
model knows they exist. Files not referenced from `SKILL.md` will
never be seen.

### 1.4 Discovery, precedence, and scopes

| Location   | Path                                    | Applies to |
| ---------- | --------------------------------------- | ---------- |
| Enterprise | Managed settings                        | All users in the org |
| Personal   | `~/.claude/skills/<name>/SKILL.md`      | All the user's projects |
| Project    | `.claude/skills/<name>/SKILL.md`        | This project only |
| Plugin     | `<plugin>/skills/<name>/SKILL.md`       | Where the plugin is enabled |

Precedence on name collision: **enterprise > personal > project**.
Plugins use a `plugin-name:skill-name` namespace so they don't
collide. If a skill and a `.claude/commands/` file share a name, the
skill wins.

Claude Code also:

- **Live-reloads** skill directories that existed at session start —
  add/edit/delete a file in `~/.claude/skills/` or project
  `.claude/skills/` and it's picked up mid-session. Adding a new
  top-level skills directory requires a restart so the watcher can
  pick it up.
- **Walks up from the working file** — if you're editing
  `packages/frontend/src/foo.ts`, Claude Code also loads skills
  under `packages/frontend/.claude/skills/`. This is explicit
  monorepo support.
- **Loads `.claude/skills/` from `--add-dir` directories** — this is
  an exception to the normal `--add-dir` semantics, where most config
  is *not* loaded from additional directories.

### 1.5 Progressive disclosure mechanism

The headline quote from the [Anthropic engineering
blog](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills):

> Like a well-organized manual that starts with a table of contents,
> then specific chapters, and finally a detailed appendix, skills let
> Claude load information only as needed.

The three levels as stated in the blog:

1. **Metadata.** "At startup, the agent pre-loads the `name` and
   `description` of every installed skill into its system prompt."
   This is the only level that's always in context.
2. **SKILL.md body.** "If Claude thinks the skill is relevant to the
   current task, it will load the skill by reading its full
   `SKILL.md` into context."
3. **Linked files.** Anything in `scripts/`, `references/`,
   `assets/`, etc. is "the third level (and beyond) of detail, which
   Claude can choose to navigate and discover only as needed."

The Claude Code docs quantify the budgets:

- Each skill entry in the listing is truncated at **1,536 characters**
  (combined `description` + `when_to_use`).
- The total slash-command tool char budget is dynamic at 1% of the
  context window, with a fallback of 8,000 characters. Override via
  `SLASH_COMMAND_TOOL_CHAR_BUDGET`.
- On auto-compaction, the most recent invocation of each skill is
  re-attached, keeping the first **5,000 tokens** of each, sharing a
  combined budget of **25,000 tokens** across all invoked skills.

This matters for authoring: if you have 50 skills installed, each with
a 1,536-char description, you're already burning ~76 KB of
descriptions in every turn. Strip descriptions ruthlessly — every
listed skill competes for that ~8 KB/1% budget.

### 1.6 Invocation control matrix

| Frontmatter | User /cmd | Claude auto | Description in context | SKILL.md in context |
| ----------- | --------- | ----------- | ---------------------- | ------------------- |
| (default)   | yes       | yes         | yes (always)           | on invoke           |
| `disable-model-invocation: true` | yes | no | **no** | on user invoke |
| `user-invocable: false`          | no  | yes | yes (always) | on Claude invoke |

A useful consequence: a skill with `disable-model-invocation: true`
doesn't even have its description burn listing budget, because Claude
will never pick it. This is the right choice for /deploy, /commit,
/release, and anything with destructive side effects.

### 1.7 Skill lifecycle in context

> When you or Claude invoke a skill, the rendered `SKILL.md` content
> enters the conversation as a single message and stays there for the
> rest of the session. Claude Code does not re-read the skill file on
> later turns, so write guidance that should apply throughout a task
> as standing instructions rather than one-time steps.

Two consequences:

- **Don't write one-shot steps.** Write as standing rules that still
  make sense 20 turns later. "Always prefer X over Y" holds up;
  "First, read foo.ts" does not.
- **You can't hot-patch an active skill.** Editing the file triggers
  live-reload for *future* invocations but the already-injected
  message stays until compaction.

---

## 2. Scripted skills pattern

### 2.1 What "scripted skill" means in this ecosystem

A scripted skill is a skill whose body refers to executable content
the agent is expected to run rather than reading and following. There
are three distinct sub-patterns, and a good skills audit should
classify every skill into one of them:

1. **Instruction skill.** Pure markdown prose + rules. No scripts.
   Example: `api-conventions` with "use RESTful naming, return
   consistent errors". The model is the executor; the skill is just
   context.

2. **Embedded-shell skill.** The skill body uses `` !`<cmd>` `` or
   ```` ```! ```` fenced blocks that Claude Code **pre-executes** as
   part of rendering the skill. The model never sees the command,
   only its output. This is dynamic context injection.

3. **Bundled-script skill.** The skill ships real executables in
   `scripts/` and the markdown body instructs Claude "run
   `scripts/foo.py --input $ARGUMENTS`". The model is responsible for
   deciding when and with what args. This is the pattern the
   user-facing "mostly scripted skills" brief points at.

All three are fully supported. The Claude Code docs show one example
of each. `pdf-summary` in §1 of the docs is pattern 2; the
`codebase-visualizer` worked example (copied below in §2.3) is
pattern 3.

### 2.2 Embedded shell execution — the `` !`cmd` `` syntax

From the docs:

> The `` !`<command>` `` syntax runs shell commands **before** the
> skill content is sent to Claude. The command output replaces the
> placeholder, so Claude receives actual data, not the command itself.

Example (verbatim):

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

Multi-line form uses a fenced block opened with ` ```! ` instead of
` ``` `:

````markdown
## Environment
```!
node --version
npm --version
git status --short
```
````

Important properties:

- **Preprocessing, not tool calls.** "Each `` !`<command>` `` executes
  immediately (before Claude sees anything)." The model is handed a
  fully-rendered prompt. This is distinct from the Bash tool.
- **Shell is `bash` by default**, `powershell` via the `shell:`
  frontmatter field plus the `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
  environment variable.
- **Kill switch.** `disableSkillShellExecution: true` in settings
  replaces every `` !`cmd` `` with `[shell command execution
  disabled by policy]`. Useful for managed settings where users
  shouldn't be able to opt out.
- **Scope.** Applies to user, project, plugin, and add-dir skills.
  Bundled and managed skills are exempt (the harness trusts its
  own).

Bundled-script execution is not preprocessing; it happens via the
Bash tool at runtime under the skill's `allowed-tools` grants.

### 2.3 Reference implementation: bundled-script skill

This is the full codebase-visualizer example from the Claude Code
docs, which is the canonical "skill that ships a real Python script"
pattern:

```yaml
---
name: codebase-visualizer
description: Generate an interactive collapsible tree visualization of your codebase. Use when exploring a new repo, understanding project structure, or identifying large files.
allowed-tools: Bash(python *)
---

# Codebase Visualizer

Generate an interactive HTML tree view that shows your project's file
structure with collapsible directories.

## Usage

Run the visualization script from your project root:

```bash
python ~/.claude/skills/codebase-visualizer/scripts/visualize.py .
```

This creates `codebase-map.html` in the current directory and opens
it in your default browser.

## What the visualization shows

- Collapsible directories: click folders to expand/collapse
- File sizes: displayed next to each file
- Colors: different colors for different file types
- Directory totals: shows aggregate size of each folder
```

Layout:

```
~/.claude/skills/codebase-visualizer/
├── SKILL.md
└── scripts/
    └── visualize.py   # ~150 lines, stdlib-only Python
```

Design notes the docs emphasize:

- **The script is referenced by absolute-ish path** relative to the
  skill dir. Use `${CLAUDE_SKILL_DIR}` in skills that need to work
  regardless of cwd.
- **`allowed-tools: Bash(python *)`** pre-approves Python invocation
  so the user isn't prompted. Narrowly scoped: only `python`, not
  `Bash(*)`.
- **The description front-loads the triggers.** "Use when exploring a
  new repo, understanding project structure, or identifying large
  files." These are the keywords Claude matches against.
- **The script is stdlib-only.** No `pip install` step required,
  because a skill with setup steps will go stale. This is a recurring
  pattern in all the production skills reviewed.

### 2.4 Reference implementation: `anthropics/skills/pdf`

The `pdf` skill ([full SKILL.md](https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md)) is a hybrid — it has
both inline code examples (teaching the model how to use `pypdf`,
`pdfplumber`, `reportlab`) **and** bundled helper scripts under
`scripts/` for the parts that are too specific for the model to
write correctly. Frontmatter:

```yaml
---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill.
license: Proprietary. LICENSE.txt has complete terms
---
```

Bundled scripts directory:

```
skills/pdf/
├── SKILL.md
├── LICENSE.txt
├── forms.md           # Loaded on demand when the task is form-filling
├── reference.md       # Loaded on demand for advanced features
└── scripts/
    ├── check_bounding_boxes.py
    ├── check_fillable_fields.py
    ├── convert_pdf_to_images.py
    ├── create_validation_image.py
    ├── extract_form_field_info.py
    ├── extract_form_structure.py
    ├── fill_fillable_fields.py
    └── fill_pdf_form_with_annotations.py
```

Key moves:

- **Description is deliberately long and keyword-heavy.** It lists
  every verb the user might say (read, extract, combine, merge,
  split, rotate, watermark, fill, encrypt, OCR). Max is 1024 chars
  for the open spec, so there's generous room.
- **Reference splits.** `forms.md` and `reference.md` are separate
  files the SKILL.md *tells* Claude to load only when needed. "If
  you need to fill out a PDF form, read FORMS.md and follow its
  instructions." This is canonical progressive disclosure.
- **Scripts are one-purpose each.** `check_fillable_fields.py` does
  one thing. `fill_fillable_fields.py` does one thing. The model
  orchestrates; the scripts do single well-defined steps.

### 2.5 Reference implementation: `anthropics/skills/docx`

```yaml
---
name: docx
description: "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Triggers include: any mention of 'Word doc', 'word document', '.docx', or requests to produce professional documents with formatting like tables of contents, headings, page numbers, or letterheads. Also use when extracting or reorganizing content from .docx files, inserting or replacing images in documents, performing find-and-replace in Word files, working with tracked changes or comments, or converting content into a polished Word document. If the user asks for a 'report', 'memo', 'letter', 'template', or similar deliverable as a Word or .docx file, use this skill. Do NOT use for PDFs, spreadsheets, Google Docs, or general coding tasks unrelated to document generation."
license: Proprietary. LICENSE.txt has complete terms
---
```

Notice the **negative triggers**: "Do NOT use for PDFs, spreadsheets,
Google Docs, or general coding tasks unrelated to document
generation." This is what keeps a keyword-rich skill from firing on
everything. A description that only lists positive triggers will
over-fire.

The body teaches the model to use two tools: `pandoc` for reading,
`docx` npm package for writing, and ships a `scripts/office/*.py` set
for unpacking, validating, and converting. Again: the scripts do the
deterministic work, the model handles the flexible orchestration.

### 2.6 Reference implementation: `obra/superpowers/test-driven-development`

A no-scripts, pure-instruction skill from the
[obra/superpowers](https://github.com/obra/superpowers) community library:

```yaml
---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know
if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Use

**Always:**
- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (ask your human partner):**
- Throwaway prototypes
- Generated code
- Configuration files

Thinking "skip TDD just this once"? Stop. That's rationalization.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
...
```

Three things to copy from this pattern:

- **Description is pure triggering conditions.** "Use when implementing
  any feature or bugfix, before writing implementation code." No
  summary of the workflow. This is deliberate — see §4.2 below.
- **Structured sections for LLM scan-ability.** Overview → Core
  principle → When to Use (always / exceptions) → Iron Law →
  Red-Green-Refactor. Predictable heading order.
- **Anti-rationalization content.** "Thinking 'skip TDD just this
  once'? Stop. That's rationalization." This is the *pressure test*
  pattern from §9.2.

### 2.7 Other scripted-skill frameworks (for context)

These aren't Claude Code skills, but they're the prior art for
"markdown file with executable code blocks inside":

| Tool | What it is |
| ---- | ---------- |
| [mdsh](https://github.com/bashup/mdsh) | Bash script compiler that turns unindented triple-backtick fenced blocks in markdown into runnable bash. Used as a `#!` line to make markdown files executable. |
| [Runme](https://runme.dev/) | VS Code-integrated runbook runner for markdown. Supports Shell, Python, Ruby, JS, Lua, PHP via shebangs. "Makes runbooks actually runnable." |
| [Runbook.md](https://github.com/kjkuan/Runbook.md) | Bash-first literate runbooks. Triple-backtick-fenced bash blocks run in order in a single shell process. |
| [mdrb](https://jsr.io/@andrewbrey/mdrb) | TypeScript/Deno-based markdown runbook runner. |
| [mask](https://github.com/jacobdeichert/mask) / [maid](https://github.com/egoist/maid) / [just-md patterns] | Task runners that treat markdown H2s as command names and fenced blocks as the command body. `mask build` runs the body under `## build`. |

The relevance to Fulcrum skills: all of these are
**deterministically executing** every fenced block they find. Claude
Code's model is more selective — the LLM decides when to run a
script. But the authoring ergonomics are identical: one markdown
file, prose for humans, fenced blocks for machines, tight loop
between "read the doc" and "run the code".

If Fulcrum skills want to lean scripted, the `mask`-style convention
is worth adopting as a secondary affordance: every `### command-name`
with a fenced bash block under it can be run directly. Agent-friendly
*and* human-friendly.

---

## 3. YAML frontmatter best practices

### 3.1 Required minimum

From `agentskills.io`, the only fields you *must* have are `name` and
`description`. Everything else is optional. A lint rule should block
any `SKILL.md` that omits either, and should check:

- `name` matches `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` and doesn't
  contain `--`.
- `name` equals the parent directory name.
- `description` is 1–1024 chars for cross-runtime compatibility
  (1,536 is the Claude-Code-only cap and includes `when_to_use`).
- `description` is non-empty.

### 3.2 Description writing — the rules that actually matter

This is the single most impactful part of authoring a skill. Both the
Anthropic blog and the `obra/superpowers/writing-skills` skill
hammer the same points:

1. **Description = trigger conditions, NOT workflow summary.** This
   is from `writing-skills` and is backed by empirical testing:

   > Testing revealed that when a description summarizes the skill's
   > workflow, Claude may follow the description instead of reading
   > the full skill content. A description saying "code review between
   > tasks" caused Claude to do ONE review, even though the skill's
   > flowchart clearly showed TWO reviews (spec compliance then code
   > quality). When the description was changed to just "Use when
   > executing implementation plans with independent tasks" (no
   > workflow summary), Claude correctly read the flowchart and
   > followed the two-stage review process.
   >
   > **The trap:** Descriptions that summarize workflow create a
   > shortcut Claude will take. The skill body becomes documentation
   > Claude skips.

   The rule that falls out: **the description should answer "should I
   read the full skill right now?" and nothing else.**

2. **Start with "Use when…"** Third-person, present tense, no "I" or
   "you". The description is injected into the system prompt.

3. **Front-load keywords.** Because the combined text is truncated at
   1,536 chars in Claude Code's skill listing, the most load-bearing
   triggers go first. If the skill is about error handling in async
   tests, the first ten words should include "async", "test",
   "flaky", "timing".

4. **Use the user's words, not yours.** Claude auto-triggers on
   description similarity to the user's current message. If users
   say "flaky tests" and your description says "non-deterministic
   verification", you'll miss. Log real user phrases and feed them
   back in.

5. **Technology-agnostic if the skill is technology-agnostic.** Don't
   say "Use when tests use setTimeout" if the skill is about race
   conditions in general. Say "Use when tests have race conditions,
   timing dependencies, or pass/fail inconsistently".

6. **Include negative triggers.** The `anthropics/skills/docx`
   description ends with "Do NOT use for PDFs, spreadsheets, Google
   Docs…". This materially cuts false triggers when there are
   sibling skills with overlap.

7. **Max ~500 characters is the sweet spot** for most skills per
   the `writing-skills` guidance, even though the hard cap is 1024
   (spec) / 1536 (Claude Code).

### 3.3 Name discipline

- One name per concept, hyphen-separated, verb-first for task skills
  (`creating-skills`, `condition-based-waiting`), noun-first for
  reference skills (`api-conventions`, `docx`).
- The name becomes `/name` in the slash-command namespace, so avoid
  collisions with Claude Code's bundled commands (`/simplify`,
  `/batch`, `/debug`, `/loop`, `/claude-api`, `/help`, `/compact`,
  `/init`, etc.).
- If you namespace by purpose, prefer a single flat namespace with
  descriptive names rather than nested directories. Both
  `anthropics/skills` and `obra/superpowers` use a flat layout.

### 3.4 Versioning

The open spec has no version field. `metadata.version` is the
conventional place (see the spec's own example). Claude Code doesn't
use it. Practical approach for a library:

- Use the `metadata` bag for a semver string.
- Keep skills backward compatible by **only adding** headings to
  `SKILL.md` and new files under `scripts/`. Never rename a script,
  because any other skill that references it will break.
- If you must rename, introduce the new path and leave the old as a
  one-line stub (`scripts/old.py` → `exec python new.py "$@"`).
- Treat the description field as API. Renaming or re-wording it
  changes the trigger surface and can silently regress behavior.
  Test after every description edit (see §9).

### 3.5 `allowed-tools` — write the narrowest grant that works

The field pre-approves tools for the duration of the skill. Claude
Code examples:

```yaml
allowed-tools: Read Grep
```

```yaml
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
```

```yaml
allowed-tools: Bash(gh *)
```

Rules:

- Narrow the Bash surface via glob: `Bash(git add *)` not `Bash(*)`.
- If the skill reads files, `Read` alone is enough — don't grant Bash.
- If the skill runs Python, `Bash(python *)` is the tight scope. Don't
  grant `Bash(python:*)` and then also `Bash(sh *)`.
- Deny rules still apply on top — if the permission config denies a
  tool, `allowed-tools` cannot grant it.

---

## 4. Body writing best practices

### 4.1 Structural template

The structure every effective skill reviewed for this doc converges on:

```markdown
# <Skill Name>

## Overview
One paragraph. What is this? Core principle in 1-2 sentences.

## When to Use
- Symptoms and situations
- When NOT to use

## Core Pattern
The one-sentence or before/after that captures the whole thing.

## Quick Reference
Table or bullets for scanning — the thing you'd tattoo on your arm.

## Steps / Implementation
Numbered, deterministic, minimal branching.
Inline code for simple patterns (<50 lines).
Link to scripts/ for heavy reference or reusable tools.

## Common Mistakes
What goes wrong + fixes. This is usually where a skill earns its keep.

## Red Flags
Phrases/symptoms that mean "you are about to violate this skill".
Useful because the LLM will recognize them in its own output.

## Examples (optional)

## Related (optional)
Links to sibling skills.
```

### 4.2 Writing for LLMs vs humans

They overlap more than you'd expect, but there are differences:

- **Tables beat paragraphs.** The model scans better than it reads.
  Every skill in `anthropics/skills` uses a "Quick Reference" table
  near the top.
- **Numbered steps beat flowing prose.** Same reason.
- **Headings are search keys.** The model will grep its own context
  for a heading it remembers.
- **Repetition of the key rule is fine, even desirable.** Human docs
  prune repetition; skill docs benefit from it because each
  repetition is another chance to match the thing the model is
  currently doing.
- **Second-person imperative ("Do X") beats first-person ("You should
  do X").** Minor but consistent.
- **Anti-rationalization content.** If there's a way to skip the
  skill ("just this once", "it's a prototype"), name it and call it
  rationalization. The `test-driven-development` skill does this:
  "Thinking 'skip TDD just this once'? Stop. That's rationalization."
  This materially changes behavior under pressure.

### 4.3 Length

> Keep `SKILL.md` under 500 lines. Move detailed reference material to
> separate files. — Claude Code docs

Backed by `agentskills.io`:

> Instructions (< 5000 tokens recommended): The full `SKILL.md` body
> is loaded when the skill is activated.

Practical thresholds:

- **< 50 lines**: consider making it a CLAUDE.md section instead.
- **50–200 lines**: sweet spot. Single topic, full coverage, no
  supporting files.
- **200–500 lines**: split into `SKILL.md` + one or two
  `references/*.md` files.
- **> 500 lines**: split the skill into two skills. If you can't,
  your `SKILL.md` is a table of contents and the real content is in
  `references/`.

### 4.4 When to split one skill into several

Split when:

- Two audiences need different subsets. (`pdf` handles both reading
  and form-filling; the spec is a judgment call that could equally
  go either way.)
- Two trigger populations are disjoint. If the
  "when to use" section has `OR` in it connecting two unrelated
  situations, split.
- One subset is destructive and the other is read-only. Give the
  destructive one `disable-model-invocation: true`.

### 4.5 Cross-linking

- Always use **relative paths from the skill root**:
  `[forms](forms.md)`, `scripts/extract.py`.
- Keep reference depth shallow — **one level from `SKILL.md`**, per
  the spec.
- To reference another skill, use its slash-name in prose: "Follow
  `/tdd` before writing any implementation code". The model will
  either invoke it or simulate following it; both work.
- If you reference a file the agent needs to load, say so explicitly
  ("read `references/api-map.md` before proceeding"). Implicit
  references are ignored.

### 4.6 Anti-patterns

The ones to ban outright in a Fulcrum skills audit:

1. **Vague "be helpful" skills.** "Always be polite and helpful." —
   this is system-prompt content, not a skill.
2. **Skills that duplicate CLAUDE.md.** If the same content is in
   both, the CLAUDE.md version always wins (always in context) and
   the skill is dead weight in the listing budget.
3. **Skills that contradict each other.** Two skills saying "use
   pytest" and "use unittest" — the model picks one and the other
   just wastes description budget. Consolidate.
4. **Skills whose body is a story.** "I once had to debug a race
   condition and here's what I learned…" — narrative over reference.
   Rewrite as reference.
5. **Workflow summaries in descriptions.** (See §3.2.) The single
   biggest behavioral regression in real-world skill libraries.
6. **Undocumented supporting files.** Files in `scripts/` or
   `references/` that `SKILL.md` doesn't mention. They'll never be
   loaded.
7. **Skills that require setup.** If the skill says "first run
   `pip install foo`", assume that step will silently be skipped.
   Either ship it as a script that auto-installs into a venv, or use
   stdlib-only.
8. **Skills with `allowed-tools: Bash(*)`.** Too broad. Lint.
9. **Skills that re-read files on every turn.** Claude Code doesn't
   re-render the skill after invocation. Guidance has to be standing
   instructions, not "first read then do".
10. **Skills longer than 500 lines of a single flowing document.**
    Split or demote to CLAUDE.md.

---

## 5. Choosing between skill / subagent / slash command / MCP tool

Claude Code supports all four. The official position as of the docs
reviewed is:

> Custom commands have been merged into skills.

So the real choice is 3-way: skill vs subagent vs MCP tool. Here is
the decision matrix.

| Criterion | Skill | Subagent | MCP tool |
| --------- | ----- | -------- | -------- |
| **Unit of work** | Procedure / playbook / knowledge | A whole sub-task with its own context | A single callable function |
| **Primary interface** | Markdown + optional scripts | System prompt + tool grants | JSON schema in/out |
| **Invoked by** | Model (auto) or user (`/name`) | Model via the subagent tool | Model via tool-use |
| **Context isolation** | None by default; `context: fork` is opt-in | Always isolated | N/A (single turn) |
| **Best for** | Procedural knowledge: "how we deploy", "our test conventions", "the five-step bug-triage playbook" | Long-running exploration with its own budget: "go audit all routes for auth checks" | Deterministic I/O: DB queries, API calls, file system operations |
| **Side effects** | Dangerous to auto-invoke; use `disable-model-invocation` | Safe; subagent returns a report | Safe if the tool is scoped |
| **Reusability across projects** | Easy (copy the directory) | Moderate (the `.claude/agents/` file) | Hard (requires MCP server deployment) |
| **Versioning** | Git + `metadata.version` | Git + filename | MCP semver |
| **When not to use it** | When the thing is a one-shot or a pure API call | When the task fits in the parent context | When the thing is judgment-heavy and has no deterministic contract |

**Rules of thumb:**

- "I keep pasting this playbook" → **skill.** This is the first
  sentence of the Claude Code docs.
- "I need a specialist with its own context budget" → **subagent.**
- "I need to read from / write to an external system with a
  contract" → **MCP tool.**
- "I need all three" → ship a skill that `allowed-tools`-grants an
  MCP tool and can `context: fork` into a subagent. That's the
  composite pattern and it's supported.

Common wrong-choice examples:

- **Wrong:** skill for "deploy this service". **Right:** skill that
  wraps the deploy command, with `disable-model-invocation: true`.
  (Skills *are* the modern slash-command.)
- **Wrong:** MCP tool for "our code review checklist". **Right:**
  skill. The checklist is text and judgment; it's not an API call.
- **Wrong:** subagent for "generate a commit message from `git
  diff`". **Right:** skill with `!`git diff`` dynamic injection.
  Subagent overhead is wasted; you don't need an isolated context.
- **Wrong:** skill whose body is "call this API with these params".
  **Right:** MCP tool. You're reinventing tool-use through prose.

---

## 6. Executable skill pattern deep-dive

This is the section the brief cares about most: "mostly scripted
skills with YAML-in-MD parts".

### 6.1 Architecture

The canonical shape:

```
skill-name/
├── SKILL.md              # frontmatter + orchestration prose
├── scripts/              # the muscle
│   ├── step1.sh
│   ├── step2.py
│   └── validate.sh
├── references/           # loaded on demand for rare cases
│   └── edge-cases.md
└── assets/               # templates, schemas, golden files
    └── template.json
```

The SKILL.md body follows this pattern:

```markdown
---
name: skill-name
description: Use when <triggers>. <negative triggers>.
allowed-tools: Bash(scripts/* *) Read Grep
---

# Skill Name

## Overview
<one paragraph>

## Steps

1. Check preconditions: run `scripts/check.sh`.
   If it fails, fix the problem and re-run.
2. Run the main operation: `scripts/do-thing.py --input $1`.
   The script writes to `.skill-cache/out.json`.
3. Validate: `scripts/validate.sh .skill-cache/out.json`.
4. On success, print a one-line summary with the output path.

## Edge cases
For unusual inputs, see [references/edge-cases.md](references/edge-cases.md).

## Outputs
- `.skill-cache/out.json` — machine-readable
- stdout — human-readable summary
```

The key design choices:

- **Scripts do deterministic work.** Parsing, validation, HTTP calls,
  data transformation. Anything where the right answer is a function.
- **SKILL.md does orchestration.** When to run which script, what to
  do when it fails, how to read the output.
- **References hold the weird stuff.** Edge cases and rare-path
  documentation that shouldn't inflate the main file.
- **`allowed-tools` is narrow.** `Bash(scripts/* *)` is the smallest
  grant that lets Claude run anything under `scripts/` without
  prompting, and nothing else.
- **There's a `.skill-cache/` convention** for intermediate state.
  Invent it once, document it, reuse it across skills.

### 6.2 Two failure modes unique to scripted skills

1. **Stale scripts.** A script that worked three months ago but
   depends on an API or CLI flag that changed. Defense: every
   scripted skill should start with a `scripts/check.sh` that
   verifies its prereqs (CLI versions, env vars, auth state). The
   model is instructed to run it as step 1.

2. **Cwd confusion.** Claude invokes scripts from the project's cwd,
   not the skill's directory. Absolute paths via `${CLAUDE_SKILL_DIR}`
   fix this:

   ```markdown
   Run the script:

   ```bash
   python ${CLAUDE_SKILL_DIR}/scripts/do-thing.py "$@"
   ```
   ```

### 6.3 Embedded shell vs bundled script — how to choose

Use `` !`cmd` `` (embedded shell / preprocessing) when:

- The output is **small and static** for the rest of the session
  (git status snapshot, current branch, tool versions).
- You want the data injected into the first turn automatically.
- The command is idempotent and read-only.

Use `scripts/foo.sh` (bundled script, tool-invoked) when:

- The script has **arguments the model chooses**.
- The script has **side effects**.
- The script can be **re-run with different inputs** within the same
  session.
- The script is **complex enough to need error handling** the model
  should see.

The two are composable: a skill can pre-inject "here's the current
state" via `` !`cmd` `` in the frontmatter region of the body, and
then tell the model "to change state, run
`scripts/change.sh`".

### 6.4 Orchestration-only skills (workflow definitions)

A related pattern: the SKILL.md is pure orchestration, calling into
MCP tools or other skills rather than local scripts. Example shape:

```yaml
---
name: release
description: Use when cutting a release. Steps: bump version, update changelog, tag, push, publish.
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(npm *) mcp__github__create_release
---

# Release workflow

1. `/tdd` verify: all tests pass, use the test-driven-development skill
   to confirm the current state is releasable.
2. Bump version: `npm version $ARGUMENTS`.
3. Update `CHANGELOG.md` per Keep a Changelog format.
4. Commit: `git commit -am "release: v$(node -p "require('./package.json').version")"`.
5. Tag and push: `git tag ... && git push --follow-tags`.
6. GitHub release: use the `mcp__github__create_release` tool.
```

This is essentially a **workflow engine encoded in markdown**. It's
the right call when the steps are stable but the order of operations
needs judgment ("rerun tests after updating changelog if the diff
changed any test files").

---

## 7. Comparisons: OpenAI, Cursor, Copilot, CrewAI, Aider

### 7.1 Cursor rules (`.cursor/rules/*.mdc`)

[Cursor's rules system](https://cursor.com/docs/context/rules) uses
`.mdc` files with YAML frontmatter for `description`, `globs`, and
`alwaysApply`. Four application modes:

1. **Always Apply** — in every chat session.
2. **Apply Intelligently** — model decides based on description.
3. **Apply to Specific Files** — triggered by glob match.
4. **Apply Manually** — via @-mention.

Scope: project (`.cursor/rules/`), user (global), team (org).

**Comparison to Claude Code skills:**

| Aspect | Cursor rules | Claude Code skills |
| ------ | ------------ | ------------------ |
| File format | `.mdc` (markdown + frontmatter) | `SKILL.md` (markdown + frontmatter) |
| Unit | One file | One directory |
| Supporting files | Not supported | `scripts/`, `references/`, `assets/` |
| Auto-trigger mechanism | `description` + `globs` + mode | `description` + `paths` + `when_to_use` |
| User-invocable | @-mention | `/slash-command` |
| Max file size | 500 lines recommended | 500 lines recommended |
| Executable scripts | No | Yes |

**The important difference:** Cursor rules are *rules* — prose
context that shapes the model's behavior. Claude skills are *units
of action* that can ship executable code. For "mostly scripted
skills", Cursor's model is not sufficient; Claude's is.

### 7.2 GitHub Copilot custom instructions

- Repo-wide: `.github/copilot-instructions.md`, plain markdown, no
  frontmatter.
- Path-specific: `.github/instructions/<NAME>.instructions.md` with
  a frontmatter `applyTo:` field containing a glob.
- Priority: personal > repository > organization.
- Multiple files concatenate for the same request if all apply.

**Limitation:** no scripts, no slash-command invocation, no
progressive disclosure. It's a single prompt-prefix system.

### 7.3 Aider

Aider uses `.aider.conf.yml` for configuration and
`CONVENTIONS.md` for project conventions. No skills concept per se.
Custom commands are Python hooks defined in the config. Out of
scope for skill-authoring patterns, but relevant for the "where to
put project conventions" question — Aider puts them in a top-level
markdown file that's always in context. Claude's CLAUDE.md is the
direct equivalent.

### 7.4 CrewAI

CrewAI agents are YAML-defined with a completely different shape:

```yaml
agents:
  researcher:
    role: "Senior Research Analyst"
    goal: "Uncover cutting-edge developments in AI"
    backstory: "You work at a leading tech think tank..."
    tools: [serper, browser]
    llm: openai/gpt-4o
```

This is an *agent definition*, not a skill. The closest Claude-Code
analogue is `.claude/agents/<name>.md` (subagents), not skills.
CrewAI has no skills-equivalent concept; knowledge bundles for
CrewAI are just RAG corpora.

### 7.5 OpenAI Assistants / Custom GPTs

Custom GPT instructions are a single blob of markdown, up to 8000
chars, with optional "Knowledge" files (RAG-backed) and optional
"Actions" (OpenAPI specs). No concept of selective loading, no
progressive disclosure. A custom GPT instruction is the pre-skills
world.

### 7.6 Aggregate observation

Claude Code's skills system is the most complete of the lot. It is
the **only** mainstream agent system today that combines:

- Progressive disclosure (three levels)
- Bundled executable scripts
- User *and* model invocation paths
- Live reload
- Scope precedence (enterprise/user/project/plugin)
- Dynamic context injection (`` !`cmd` ``)
- Subagent forking from a skill (`context: fork`)

Authoring guidance from Cursor rules, Copilot instructions, and
CrewAI configs is still worth reading, but the feature surface they
target is a strict subset of Claude Code's.

---

## 8. What makes a skill work vs not

This is a distillation of the commentary in the Anthropic blog, the
`writing-skills` skill, and public post-mortems from the community
libraries reviewed.

### 8.1 Patterns that correlate with skills that actually change behavior

1. **The skill was born from a concrete failure.** Someone saw the
   agent do the wrong thing, noted the exact rationalization, and
   wrote a skill to block that rationalization. This is the TDD-for-
   skills model from `writing-skills`.
2. **The description uses the user's vocabulary.** Derived from logs
   of real asks, not from how the author would describe the skill.
3. **The body contains at least one "red flag" rule** — a phrase the
   model might produce that means "you are about to violate this
   skill". Lets the model self-correct.
4. **The body is under 200 lines.** Longer skills bury the one rule
   that actually matters.
5. **Scripts are stdlib-only or ship as single files.** No setup
   step. The model will skip setup and then the skill fails.
6. **The skill was A/B tested.** Pressure scenario + subagent, with
   and without the skill loaded. See §9.2.

### 8.2 Patterns that correlate with skills that do nothing

1. **Description is a summary of what the skill teaches.** The model
   reads the description, thinks "I know this", and doesn't load the
   body.
2. **Body is a narrative.** "Once upon a time we had a bug…".
3. **Body is a list of vague principles.** "Be careful with async
   code. Think about edge cases." The model was already doing this.
4. **Body contradicts CLAUDE.md.** The always-in-context wins.
5. **Skill was never tested against a failing case.** Nobody knows
   if it changes anything.
6. **Skill fires on everything.** Over-broad description. Claude
   loads it in situations where the skill is irrelevant, the body
   confuses the task, and the user disables the skill in frustration.

### 8.3 Field-tested heuristic

From `writing-skills`:

> If you didn't watch an agent fail without the skill, you don't
> know if the skill teaches the right thing.

This is the single most-quoted sentence across the community skill
libraries reviewed. Treat it as the skill-authoring equivalent of
"red test before green test" in TDD.

---

## 9. Authoring workflow

### 9.1 Author a skill

1. **Observe a failure.** Watch the agent do the wrong thing in a
   real conversation. Write down the exact mistaken output.
2. **Name the rule** that would have prevented it. One sentence.
3. **Write a pressure scenario.** A minimal prompt that reliably
   reproduces the failure in a fresh subagent.
4. **Draft the description.** Trigger conditions only. Start with
   "Use when…". No workflow summary.
5. **Draft the body.** Overview, When to Use, the Rule, Common
   Mistakes, Red Flags. Under 200 lines.
6. **Bundle scripts** only if the deterministic part is expensive or
   error-prone to regenerate.
7. **Run the pressure scenario twice**, once with the skill loaded
   and once without. The with-skill run should pass; the without-
   skill run should fail. If both pass, your scenario is too easy.
   If both fail, your skill is wrong.
8. **Iterate.** Each failure mode discovered → close the loophole
   in the body → re-run the scenario suite.
9. **Ship.** Commit the skill directory to `.claude/skills/` (if
   project-scoped) or `~/.claude/skills/` (if personal).

### 9.2 Test a skill — the subagent pressure-test pattern

From `obra/superpowers/writing-skills/testing-skills-with-subagents.md`
(the established community method):

```
1. Spawn a fresh subagent with the pressure scenario and no skill.
2. Observe violation. Record the exact rationalization the agent used.
3. Spawn a fresh subagent with the pressure scenario and the skill.
4. Compliance? Good. No compliance? Close the loophole the agent
   used in step 2 and repeat.
```

The **rationalization** is the target, not the output. If the agent
"helpfully" skips TDD because "this is just a prototype", the skill
needs a "prototypes are not an exception" clause. The rationalization
gives you the clause.

### 9.3 Version / review / publish

- **Version.** Commit to git. Optionally put a semver in
  `metadata.version`.
- **Review.** Skills are prose + scripts; review both. Focus review
  on (a) description accuracy, (b) scripts that touch the filesystem
  or network, (c) `allowed-tools` scope.
- **Publish.** For personal use, `~/.claude/skills/`. For project
  use, commit to `.claude/skills/`. For team distribution, package
  as a plugin (Claude Code's plugin system). For cross-ecosystem,
  follow `agentskills.io` — same directory layout, restrict to the
  open-spec frontmatter fields.
- **Registries.** As of the research date: no single
  official registry. De-facto indexes: [awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills),
  [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code),
  `anthropics/skills`, `obra/superpowers`, `trailofbits/skills`,
  `alirezarezvani/claude-skills`.

---

## 10. Standards checklist for Fulcrum skills audit

### 10.1 MUST

A skill that fails any of these is broken and should not ship:

1. **Has `name` and `description`** in the frontmatter.
2. **`name` matches the parent directory** and the regex
   `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`, no `--`.
3. **`description` is ≤ 1024 chars** (≤ 1536 if shipping Claude-Code-
   only) and starts with "Use when…".
4. **`description` contains no workflow summary.** It describes *when*
   to use the skill, not *what* the skill does in procedural detail.
5. **`description` includes at least one negative trigger** if the
   skill sits next to siblings with similar positive triggers.
6. **Body is ≤ 500 lines.** If longer, it's split into `SKILL.md` +
   `references/*.md` files, and `SKILL.md` explicitly tells Claude
   when to load each reference.
7. **Every supporting file is referenced** by name from `SKILL.md`.
   Orphan files are removed or referenced.
8. **`allowed-tools` is narrowly scoped.** No `Bash(*)`.
9. **Side-effecting skills have `disable-model-invocation: true`.**
   Deploy, release, publish, delete, send, commit (auto) — all must
   be user-only.
10. **Scripts are cwd-safe.** They use `${CLAUDE_SKILL_DIR}` or
    accept absolute paths as arguments.
11. **Scripts have no install step** (or ship their own auto-install
    via a venv bootstrapper the skill runs on first use).
12. **Body uses standing-instruction language**, not one-shot step
    language, because Claude Code doesn't re-render the skill.
13. **Skill directory is inside one of:**
    `~/.claude/skills/<name>/`,
    project `.claude/skills/<name>/`,
    plugin `skills/<name>/`,
    or managed-settings location.
14. **No contradiction with CLAUDE.md.** If the skill says "use
    pytest" and CLAUDE.md says "use unittest", the skill is dead
    weight; fix one of them.
15. **At least one pressure-test scenario exists** — a recorded
    prompt that demonstrates the failure the skill prevents. Stored
    under `tests/` or in the skill's PR description.

### 10.2 SHOULD

1. Body follows the canonical structure: Overview, When to Use, Core
   Pattern, Quick Reference, Steps, Common Mistakes, Red Flags.
2. Body is ≤ 200 lines for non-reference skills.
3. Description is ≤ 500 chars.
4. Every skill is tested with and without load against its pressure
   scenario; both runs are recorded.
5. Scripts are stdlib-only where possible.
6. Scripts have a `scripts/check.sh` (or equivalent) that verifies
   prereqs, and `SKILL.md` instructs Claude to run it first.
7. `metadata.version` is set using semver.
8. `compatibility` is set when the skill assumes specific tools
   (`git`, `docker`, `node ≥ 20`, etc.).
9. Use `` !`cmd` `` for small static context injections (git status,
   versions) rather than prose instructions to run them.
10. `paths` (Claude Code) is set when the skill is file-type-specific
    so it doesn't auto-fire on unrelated files.
11. Sibling skills cross-reference each other by slash-name.
12. A `LICENSE.txt` file is present for distributable skills.

### 10.3 MAY

1. Use `context: fork` + `agent: Explore` for skills whose work is
   isolated exploration (audit, survey, research).
2. Use `when_to_use` as a second-pass trigger description for Claude
   Code-only skills.
3. Use `hooks` to enforce behavior deterministically that prose
   can't reliably enforce.
4. Ship an `eval-viewer/` or `tests/` subdirectory with quantitative
   eval fixtures, per the pattern in `anthropics/skills/skill-creator`.
5. Use `model:` or `effort:` overrides when the skill demands a
   specific model quality.
6. Ship a `scripts/install.sh` that sets up a venv on first use for
   skills that genuinely need third-party Python packages.

### 10.4 Anti-patterns we must NOT ship

1. **Workflow-summary descriptions.** ("Use when reviewing code —
   runs two-stage review.") Causes the behavior-regression from §3.2.
2. **`Bash(*)` in `allowed-tools`.** Too broad.
3. **Orphan supporting files.** Never referenced from `SKILL.md`.
4. **Skills that duplicate CLAUDE.md content.** Dead weight.
5. **Narrative-body skills.** Story-format instead of reference-
   format.
6. **"Be helpful" skills.** Vacuous. Belongs in system prompt.
7. **Destructive skills with `disable-model-invocation` unset.**
8. **Skills > 500 lines in a single `SKILL.md`.**
9. **Skills with no pressure test.** If you can't articulate the
   failure mode it prevents, delete it.
10. **Two skills whose descriptions overlap.** Consolidate or
    introduce negative triggers.
11. **Skills whose scripts have hard-coded absolute paths to the
    author's machine.**
12. **Skills that depend on a running MCP server** without declaring
    it in `compatibility`.
13. **Skills whose description mentions the skill by name** ("This
    `foo-handler` skill handles foo"). Redundant and burns budget.
14. **Skills that contradict each other.** Always-contradicting pair
    = delete one.

---

## 11. References

### Primary / official

- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills) — full Claude Code skills documentation, including every frontmatter field, discovery rules, progressive disclosure, examples, and the `codebase-visualizer` scripted-skill walkthrough.
- [Agent Skills specification, agentskills.io](https://agentskills.io/specification) — open cross-runtime spec: required fields, constraints, directory layout, progressive-disclosure levels, validation.
- [Anthropic engineering blog: Equipping agents for the real world with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills) — rationale for the three-level progressive disclosure model, design principles, security notes.
- [Claude Code commands reference](https://code.claude.com/docs/en/commands) — bundled skills and built-in commands.
- [Claude Code sub-agents](https://code.claude.com/docs/en/sub-agents) — how subagents and skills interact, `skills:` preload field.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks) — skill-scoped hook lifecycle.
- [Claude Code memory (CLAUDE.md)](https://code.claude.com/docs/en/memory) — interaction with skills, path-specific rules.
- [Claude Code permissions](https://code.claude.com/docs/en/permissions) — how `allowed-tools` composes with deny rules.
- [Claude Code plugins](https://code.claude.com/docs/en/plugins) — packaging skills for distribution.

### Reference skill libraries

- [anthropics/skills](https://github.com/anthropics/skills) — Anthropic's official reference library. Examined: `pdf`, `docx`, `skill-creator`, `mcp-builder`. Includes `template/SKILL.md` and `spec/agent-skills-spec.md`.
- [obra/superpowers](https://github.com/obra/superpowers) — community superpowers library (151k+ stars). Examined: `writing-skills`, `test-driven-development`, skills list. Source of the "description = triggering conditions, NOT workflow summary" rule.
- [trailofbits/skills](https://github.com/trailofbits/skills) — Trail of Bits security-audit skills plugins. Examined: plugin layout, ~38 security skills.
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — 232+ skills across engineering, marketing, product, compliance.
- [slavingia/skills](https://github.com/slavingia/skills) — skills based on "The Minimalist Entrepreneur".
- [awesome-claude-code, hesreallyhim](https://github.com/hesreallyhim/awesome-claude-code) — index.
- [awesome-claude-skills, travisvn](https://github.com/travisvn/awesome-claude-skills) — skill-focused index.
- [wondelai/skills](https://github.com/wondelai/skills) — agentskills.io-compatible agent skills.

### Comparison ecosystems

- [Cursor rules documentation](https://cursor.com/docs/context/rules) — `.mdc` file format, four application modes, project/user/team scopes.
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` with `applyTo:` frontmatter.

### Literate devops / executable markdown

- [mdsh, bashup/mdsh](https://github.com/bashup/mdsh) — markdown-to-bash compiler for literate shell programs.
- [Runme, runmedev/runme](https://github.com/runmedev/runme) — "DevOps notebooks built with markdown", multi-language execution.
- [Runbook.md, kjkuan/Runbook.md](https://github.com/kjkuan/Runbook.md) — Bash-executable runbooks with triple-backtick fencing.
- [mdrb, andrewbrey/mdrb](https://jsr.io/@andrewbrey/mdrb) — Deno/TS runbook runner.
- [Docable via Hacker News](https://news.ycombinator.com/item?id=24566189) — literate runbook discussion.
- [mask](https://github.com/jacobdeichert/mask) / [maid](https://github.com/egoist/maid) — markdown task runners.

### Secondary commentary

- [Claude Agent Skills: A First Principles Deep Dive, Lee Hanchung](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
- [Agent Skills: Progressive Disclosure as a System Design Pattern, SwirlAI newsletter](https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure)
- [The Genius of Anthropic's Agent Skills, OffTheGrid XP](https://offthegridxp.substack.com/p/the-genius-of-anthropics-claude-agent-skills-2025)
- [Anthropic launches enterprise Agent Skills, VentureBeat](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard)
- [How to Create Claude Code Skills: The Complete Guide, websearchapi.ai](https://websearchapi.ai/blog/how-to-create-claude-code-skills)
- [Claude's Context Engineering Secrets, Bojie Li](https://01.me/en/2025/12/context-engineering-from-claude/)
