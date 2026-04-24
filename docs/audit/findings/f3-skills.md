# F3 — Skills Audit

**Audit date:** 2026-04-14
**Auditor:** Claude (source-driven-development skill)
**Standard:** `docs/audit/research/r3-skills.md`
**Subject:** `agent-integration/skills/*.md` (13 files, flat layout)
**Installer:** `agent-integration/install.ts:385-413` (`installClaudeSkills()`)
**Overall verdict:** **REBUILD REQUIRED** — the current 13 skills are pure
prose, shipped as flat `*.md` files without the `SKILL.md`/`scripts/`
directory shape, and they reference at least six MCP tools that do not
exist. The library cannot be incrementally fixed; it must be re-authored
around the directory-per-skill, scripted-body pattern that both Claude
Code and `agentskills.io` specify.

---

## Conformance strengths

Not everything is broken. Before the findings, the things the current
library does well:

1. **Every file has `name` + `description`.** All 13 files meet the
   `MUST 1` from R3 §10.1. (`r3-skills.md:1203-1204`)
2. **Descriptions generally lead with trigger conditions, not workflow
   summaries.** Example: `block-when-stuck.md:3` — "Call block_agent_run
   instead of guessing when you cannot proceed. Applies whenever..."
   This dodges the biggest behavioral regression from R3 §3.2
   (`r3-skills.md:541-565`). Most of our skills respect this.
3. **"When to apply" sections are trigger-centric, not narrative.** This
   matches the canonical body template from R3 §4.1
   (`r3-skills.md:658-690`).
4. **Every skill has a "Red flags" section.** Red-flag phrasing is one
   of the few empirically load-bearing structural elements per R3 §8.1.3
   (`r3-skills.md:1097-1099`). We consistently ship it.
5. **Cross-links between sibling skills exist.** Most skills end with a
   "See also:" section — e.g., `start-every-task.md:64-65` links
   `recall-before-writing` and `complete-agent-run`. R3 §4.5
   (`r3-skills.md:749-759`) encourages this and we do it, albeit with
   relative-path links that will break after the install copy.
6. **Bodies are well under the 500-line ceiling.** The largest file is
   78 lines (`write-memory-on-completion.md`); R3 §4.3
   (`r3-skills.md:714-733`) recommends ≤ 500 and notes 50-200 is the
   sweet spot. We're at the low end of that sweet spot.
7. **`chief-of-staff-response-format.md` names a machine-parsed contract**
   (`parseCoSResponse()`) and enforces section order. That's the right
   model for a skill whose output is consumed by code — see R3 §6.4
   on orchestration-only skills (`r3-skills.md:954-979`).
8. **No `Bash(*)` grants anywhere** — because there are no `allowed-tools`
   grants at all. Technically this dodges the R3 §4.6.8 anti-pattern
   (`r3-skills.md:785`) by accident.

That's the end of the positive list. Everything else is a finding.

---

## Per-skill review (table)

Columns:
- **YAML ✓?** — has `name`+`description` that satisfy R3 §10.1 basics
- **Body ✓?** — matches R3 §4.1 structural template
- **Scripted?** — ships `scripts/` per R3 §2 / §6.1
- **Length** — body lines (ex. frontmatter)
- **Tools valid?** — references only MCP tools that actually exist in
  `mcp__fulcrum__*`
- **Dir shape?** — installed as `<name>/SKILL.md` or as flat `<name>.md`

| Skill | YAML | Body | Scripted? | Length | Tools valid? | Dir shape? | Issues |
|---|---|---|---|---|---|---|---|
| start-every-task | partial | partial | NO | 66 | **NO** (`spawn_agent`-adjacent, `list_agent_profiles` OK) | FLAT | Mentions `list_agent_profiles` ✓; references a `PreToolUse` hook that sets env vars but the hook isn't defined anywhere audited |
| recall-before-writing | partial | partial | NO | 69 | YES (`recall_memory` ✓) | FLAT | Invents memory-id citation format (`M-0423`) that the DB schema does not emit |
| complete-agent-run | partial | partial | NO | 62 | YES (`complete_agent_run` ✓) | FLAT | Invents `artifacts` / `pr_url` / `tests_passed` / `tests_failed` args not in the `complete_agent_run` schema |
| block-when-stuck | partial | partial | NO | 70 | YES (`block_agent_run` ✓) | FLAT | Claims "escalation_timeout_minutes default 30" — not validated against code |
| workspace-status-on-session-start | partial | partial | NO | 60 | YES (`get_workspace_status`, `build_cos_context` ✓) | FLAT | Mentions `spawn_agent` (**does not exist**) |
| chief-of-staff-response-format | partial | partial | NO | 70 | **NO** (`spawn_agent`, `dispatch_agent` do not exist) | FLAT | Invents `chief_of_staff_no_direct_writes` policy id not validated against code |
| write-memory-on-completion | partial | partial | NO | 79 | YES (`write_memory` ✓) | FLAT | Invents cross-memory linking syntax (`Supersedes M-0301`) unsupported by schema |
| integration-worker-merge-gate | partial | partial | NO | 63 | **NO** (`list_artifacts`, `review_artifact`, `run_script`, `processMergeQueue` — none exist) | FLAT | Entire skill is about tools that do not exist |
| invoke-team-only-from-cos | partial | partial | NO | 57 | **NO** (`escalate_run` does not exist; `invoke_team` exists) | FLAT | Core recommended action (`escalate_run`) does not exist in the MCP surface |
| run-workflow-not-freestyle | partial | partial | NO | 72 | **NO** (`list_workflows`, `workflow start` CLI verb) | FLAT | Mentions `fulcrum workflow start` and `list_workflows` — neither tool nor CLI verb exists |
| secret-hygiene | partial | partial | NO | 61 | YES (`block_agent_run`, `write_memory` ✓) | FLAT | Claims "nine patterns currently" for the secret scanner without citing source |
| heartbeat-during-long-operations | partial | partial | NO | 67 | YES (`heartbeat_agent_run` ✓) | FLAT | Mentions `spawn_agent` (**does not exist**) |
| index (fulcrum-skills-index) | partial | n/a | NO | 61 | **NO** (lists `spawn_agent`) | FLAT | This is a table of contents, not a skill — R3 would make this a README, not a discoverable skill |

**Summary:** 0 / 13 fully pass. 13 / 13 ship as flat `.md` files (violates
R3 §1.3, `r3-skills.md:87-121`). 0 / 13 ship scripts (violates the user's
explicit "mostly scripted skills" brief). 7 / 13 reference at least one
MCP tool or CLI verb that does not exist in the current Fulcrum surface.

---

## Findings — CRITICAL

### [F3-CRIT-01] Directory shape is wrong (flat `<name>.md` vs `<name>/SKILL.md`)

**Standard.** Both Claude Code and the open `agentskills.io` spec define
a skill as a **directory** containing `SKILL.md`. From
`r3-skills.md:87-98`:

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
```

And more explicitly at `r3-skills.md:29-32`: "The unit of a skill is a
**filesystem directory** containing a `SKILL.md` (plus optional
supporting files), not a single file."

Discovery rules at `r3-skills.md:125-131` show the canonical paths:

| Scope | Path |
|-------|------|
| Personal | `~/.claude/skills/<name>/SKILL.md` |
| Project  | `.claude/skills/<name>/SKILL.md` |
| Plugin   | `<plugin>/skills/<name>/SKILL.md` |

**Evidence from our codebase.** `agent-integration/install.ts:397-412`
installs skills as flat files:

```ts
const destDir = path.join(HOME, ".claude", "skills", "fulcrum");
mkdirp(destDir);
// ...
const dest = path.join(destDir, f);  // f = "start-every-task.md"
fs.copyFileSync(src, dest);
```

This produces:

```
~/.claude/skills/fulcrum/start-every-task.md
~/.claude/skills/fulcrum/recall-before-writing.md
~/.claude/skills/fulcrum/...
```

Not a directory-per-skill. Not a `SKILL.md`. And the top-level
`fulcrum/` directory has no `SKILL.md` either — it's a bag of loose `.md`
files, which is not a recognised shape.

**Impact.** Two distinct problems:

1. **Claude Code may not auto-load any of these.** The discovery walker
   looks for `<skillname>/SKILL.md`, not loose markdown. R3 §1.4
   (`r3-skills.md:123-151`) explicitly paths each skill to a directory.
   The docs note: "If a skill and a `.claude/commands/` file share a
   name, the skill wins" — implying the skill is located via
   directory-name, not file-name.
2. **Even if Claude Code tolerates loose files** (legacy-command
   back-compat), we are on the **deprecated** path. R3 §1.1 states
   explicitly: "Skills have replaced the older `.claude/commands/`
   format. Commands keep working but skills are the recommended path."
   (`r3-skills.md:35-38`)

**Fix.** Restructure the source tree to directory-per-skill, rename each
`*.md` → `<name>/SKILL.md`, and update `installClaudeSkills()` to copy
directory-wise. Reassess whether the `fulcrum/` namespacing prefix is
even meaningful — see F3-CRIT-02 for the right answer.

### [F3-CRIT-02] Namespacing via a `fulcrum/` parent directory is not the Claude Code convention

**Standard.** R3 §1.4 (`r3-skills.md:125-131`) shows skill paths as
`~/.claude/skills/<name>/SKILL.md`. There is **no nested parent
directory** in any of the four discovery locations. The one namespacing
mechanism Claude Code supports is plugins: `<plugin>/skills/<name>/` with
a `plugin-name:skill-name` slash invocation prefix (`r3-skills.md:133`).

Our install path is `~/.claude/skills/fulcrum/<name>.md` — a non-standard
location that's neither "flat personal" nor "plugin". There is no
documented guarantee Claude Code walks into arbitrary nested directories
under `~/.claude/skills/`.

**Impact.** Even if we fix F3-CRIT-01 to produce
`~/.claude/skills/fulcrum/start-every-task/SKILL.md`, Claude Code's
discovery walker may not descend two levels. The safe options are:

- **Option A (personal-scope, flat).** Install directly to
  `~/.claude/skills/<name>/SKILL.md` — but this squats on globally
  ambiguous names like `complete-agent-run`. Mitigation: prefix every
  skill name with `fulcrum-` so the flat namespace is still namespaced.
- **Option B (plugin).** Ship Fulcrum as a Claude Code plugin. Plugin
  discovery is defined (`r3-skills.md:130`), plugin skills get
  `plugin-name:skill-name` collision-free namespacing, and plugins can
  ship commands, hooks, and MCP servers together. This is the shape a
  mature tool suite should adopt.
- **Option C (project-scope).** Install to the project's
  `.claude/skills/<name>/SKILL.md` via a `fulcrum init`-style step that
  writes into the repo — not into `~/.claude`. Avoids globals entirely.

The **current path is none of these** — it's a custom convention with
no documentation support.

**Fix.** Adopt Option B (plugin) as the primary ship target and Option C
(project-scope) as a fallback for users who install per-repo. Drop the
ad-hoc `~/.claude/skills/fulcrum/*.md` path.

### [F3-CRIT-03] Zero scripted skills — the entire library is prose

**Standard.** The user's brief: "mostly scripted skills with yaml like in
md parts". R3 §2.1 (`r3-skills.md:225-244`) classifies every skill into
three patterns:

1. Instruction skill (pure prose)
2. Embedded-shell skill (`` !`cmd` `` preprocessing)
3. Bundled-script skill (`scripts/` subdirectory)

The canonical example is `codebase-visualizer` (R3 §2.3,
`r3-skills.md:310-354`), which ships `scripts/visualize.py` and
pre-approves it via `allowed-tools: Bash(python *)`.

**Evidence.** Our 13 skills contain:

- **0** `` !`cmd` `` preprocessing blocks
- **0** `scripts/` references
- **0** `allowed-tools` grants
- **~100%** prose-to-script ratio, across all 13 skills

Every single skill is pattern 1 (pure instruction). The user said
"mostly scripted". We have zero. This is the single largest gap in the
audit.

**Impact.** Skills that could be half the length, twice as effective,
and self-verifying are shipped as rambling prose that the model may skim
or ignore. Specifically:

- `workspace-status-on-session-start.md` tells the model to call
  `get_workspace_status` and interpret the response. This could ship a
  `scripts/status.sh` that calls the MCP server via `fulcrum status`
  and prints a pre-formatted human-readable snapshot, which the skill
  body injects via `` !`scripts/status.sh` `` at load time.
- `start-every-task.md` could ship a `scripts/list-my-tasks.sh` that
  the skill body tells the model to run before creating a new task.
- `integration-worker-merge-gate.md` could ship a
  `scripts/check-merge-gate.sh` that encapsulates the review-artifact +
  test-artifact + role check and returns a single pass/fail.
- `run-workflow-not-freestyle.md` could ship a
  `scripts/list-workflows.sh` that prints currently registered
  workflows via `` !`cmd` `` at load time, so the model sees fresh
  data, not a stale hand-maintained list in prose.

**Fix.** Rebuild every skill that has a deterministic observable step
around a bundled script. Specific candidates in the "Scripted-skills
refactor" section below.

### [F3-CRIT-04] Seven of thirteen skills reference MCP tools that do not exist

**Standard.** R3 §1.1 (`r3-skills.md:14-27`) defines skills as "a
playbook, checklist, or multi-step procedure". A procedure that instructs
the model to call a non-existent tool is not a playbook; it's a
hallucination dressed as one.

**Evidence.** The actually-exposed Fulcrum MCP surface in this session
is: `block_agent_run`, `build_cos_context`, `complete_agent_run`,
`create_agent_profile`, `create_task`, `create_team_template`,
`get_agent_run_status`, `get_workspace_status`, `heartbeat_agent_run`,
`invoke_team`, `list_agent_profiles`, `list_tasks`, `list_team_instances`,
`list_team_templates`, `recall_memory`, `start_agent_run`, `update_task`,
`write_memory`. (18 tools.)

Tools referenced in skills that **do not exist** in that surface:

| Skill | Non-existent reference | Severity |
|---|---|---|
| `chief-of-staff-response-format.md:54` | `mcp__fulcrum__spawn_agent` | CRIT |
| `chief-of-staff-response-format.md:55` | `mcp__fulcrum__dispatch_agent` | CRIT |
| `workspace-status-on-session-start.md:54` | `spawn_agent` | CRIT |
| `heartbeat-during-long-operations.md:27` | `spawn_agent` | CRIT |
| `integration-worker-merge-gate.md:29` | `mcp__fulcrum__list_artifacts` | CRIT |
| `integration-worker-merge-gate.md:22, 46, 53` | `review_artifact` / `run_script` / `processMergeQueue` | CRIT |
| `invoke-team-only-from-cos.md:27` | `mcp__fulcrum__escalate_run` | CRIT |
| `run-workflow-not-freestyle.md:30, 38` | `fulcrum workflow start` CLI verb + `list_workflows` MCP tool | CRIT |
| `index.md:50` | `spawn_agent` | CRIT |

Two of the skills — `integration-worker-merge-gate.md` and
`invoke-team-only-from-cos.md` — are **entirely about** tools that do
not exist. Their recommended happy path is unrunnable.

**Impact.** When a skill fires, the model reads "call
`mcp__fulcrum__spawn_agent`" and then either (a) silently fails and
blames itself or (b) attempts the call and hits a "tool not found"
error with no recovery path. Either way, user trust in the skill layer
collapses. The rest of the library becomes suspect by association.

**Fix.** Before re-authoring anything, the Fulcrum MCP server needs a
matching set of tools **or** the skills need to be rewritten against
what actually exists. This is a prerequisite to F3-CRIT-03 (scripted
refactor) because the scripts will call the same tools.

Two options:

- **Option A.** Add the missing tools (`spawn_agent`, `dispatch_agent`,
  `escalate_run`, `list_artifacts`, `list_workflows`, `run_script`,
  `review_artifact`, plus a `merge_queue` family). This is a server
  surface expansion. Sizable scope.
- **Option B.** Rewrite the skills against the existing 18-tool
  surface. Specifically: drop `escalate_run` in favor of `block_agent_run`
  with an "escalate" reason tag; drop `spawn_agent`/`dispatch_agent` in
  favor of `invoke_team` with one-member teams; drop the entire
  artifact/merge-gate skill until there are artifact tools; drop the
  workflow skill until there are workflow tools. Smaller surface, more
  honest.

### [F3-CRIT-05] `index.md` is not a skill — it's a README pretending to be one

**Standard.** R3 §1.1 (`r3-skills.md:14-27`): a skill is a "playbook,
checklist, or multi-step procedure". R3 §4.1 (`r3-skills.md:656-690`):
the body has Overview, When to Use, Core Pattern, Quick Reference,
Steps, Common Mistakes, Red Flags.

**Evidence.** `index.md` has frontmatter `name: fulcrum-skills-index`
and a `description` that says "Table of contents for the Fulcrum
Claude Skills directory." Its body is a lifecycle ordering followed by
a table of every other skill with a one-line "When to apply". There is
no triggered situation, no procedure, no red flags.

**Impact.** It costs listing budget every turn (R3 §1.5,
`r3-skills.md:173-187`: each skill burns ~1.5 KB of the ~8 KB /
1%-of-context budget). It crowds out a real skill that might have
fired. And when it *does* fire — because its description "first time in
a Fulcrum-managed workspace" is a real trigger — the model loads a
table of contents instead of a procedure, wasting a turn.

**Fix.** Delete the skill. Keep the content as
`agent-integration/skills/README.md` (source tree only, never
installed), and let the individual skills be discovered directly by
description-match.

---

## Findings — HIGH

### [F3-HIGH-01] No `allowed-tools` grants anywhere

**Standard.** R3 §3.5 (`r3-skills.md:624-648`): "Write the narrowest
grant that works." The canonical form is
`allowed-tools: Bash(scripts/* *) Read Grep` — narrow enough to let
Claude run the skill's bundled scripts without per-call approval, broad
enough to cover the tools the skill actually uses.

**Evidence.** `agent-integration/skills/*.md:*` — zero `allowed-tools`
declarations. The field is absent from every frontmatter.

**Impact.** Two problems:

1. Every tool call the skill recommends requires per-call user approval
   (since nothing is pre-approved). This breaks the flow the skill is
   trying to enforce — the user has to confirm `recall_memory` 5 times
   in a session instead of the skill saying "use this tool, it's
   pre-approved".
2. When we add scripts per F3-CRIT-03, each script invocation will also
   prompt. A scripted skill without a matching `allowed-tools` grant is
   effectively a prose skill that tells the model to run a script.

**Fix.** For each skill, declare the minimum `allowed-tools` grant
covering the MCP tools it calls and (after scripted refactor) the
`Bash(scripts/* *)` or `Bash(python *)` glob for its bundled scripts.

### [F3-HIGH-02] Descriptions leak implementation detail and burn listing budget

**Standard.** R3 §3.2 (`r3-skills.md:541-595`): descriptions are
**trigger conditions, not workflow summaries**, 1-1024 chars with the
most load-bearing triggers first. R3 §1.5 (`r3-skills.md:173-187`): the
combined `description + when_to_use` text is truncated at 1,536 chars in
the listing and the total listing budget is ~8 KB / 1%-of-context. With
13 skills at ~200 chars each we're at 2.6 KB — fine — but several of our
descriptions drift toward workflow summaries.

**Evidence.**

- `start-every-task.md:3`: "Register an agent run before touching any
  code. Applies whenever the agent is about to call Write / Edit /
  MultiEdit / Bash for the first time in a session, or is targeted by a
  team invocation." — trigger-clean, ✓
- `chief-of-staff-response-format.md:3`: "When operating as
  chief_of_staff, end every response with the structured Status / Work
  Completed / Next Steps / Risks block. Applies to every
  chief_of_staff turn, without exception." — partial workflow summary
  (it names the structure) but mitigated by the "without exception"
  trigger. Acceptable.
- `run-workflow-not-freestyle.md:3`: "Run multi-step repeatable
  processes as registered workflows, not ad-hoc. Applies whenever you
  are about to execute a named process like grill-me, write-a-prd,
  prd-to-plan, or prd-to-issues." — trigger-clean with concrete
  example names. ✓ (example names risk bit-rot as workflows are renamed
  or added/removed)
- `recall-before-writing.md:3`: "Query the Fulcrum memory layer before
  writing new code, docs, or architectural decisions. Applies whenever
  you are about to produce novel output on a topic the project may
  have prior context on." — trigger-clean but **too vague** — the
  trigger "any novel output on a topic with prior context" fires on
  everything.
- `write-memory-on-completion.md:3`: "Persist a memory after completing
  any task that involved a decision, trade-off, or surprising finding.
  Applies after complete_agent_run when the work produced durable
  knowledge." — trigger-clean, ✓

None of our descriptions include **negative triggers** ("Do NOT use
when..."). R3 §3.2.6 (`r3-skills.md:585-589`) shows the
`anthropics/skills/docx` description explicitly does this: "Do NOT use
for PDFs, spreadsheets, Google Docs, or general coding tasks unrelated
to document generation." Without negative triggers, overlapping skills
(e.g., `start-every-task` + `workspace-status-on-session-start` both
fire on "starting something") will both load on every turn.

**Fix.** Rewrite every description to include at least one negative
trigger; target 300-500 chars each per R3 §3.2.7 (`r3-skills.md:591-593`).

### [F3-HIGH-03] Skills invent schema and config values that don't exist

**Standard.** R3 §9.3 (`r3-skills.md:1177-1194`): review skills for
description accuracy and for scripts touching the filesystem/network.
The implied invariant: the skill body must match the actual code it
instructs the model to use. R3 §10.4.1 (`r3-skills.md:1277-1278`):
"Workflow-summary descriptions... causes the behavior-regression". An
inaccurate procedure is worse than no procedure.

**Evidence.**

- `complete-agent-run.md:30-33`: claims `complete_agent_run` accepts
  `tests_passed`, `tests_failed`, `pr_url`, `artifacts` arguments. The
  actual MCP tool signature (from the loaded tool list for this
  session) shows no such fields. The skill is fictional.
- `block-when-stuck.md:49`: "Blocked runs auto-escalate to
  `chief_of_staff` after `escalation_timeout_minutes` (default 30)." No
  citation to the code path where this is implemented.
- `write-memory-on-completion.md:27-33`: invents a memory citation
  format `M-0423`, `Supersedes M-0301`, `Builds on M-0423` — the
  `recall_memory` / `write_memory` schemas have no such ID format
  convention validated against code.
- `chief-of-staff-response-format.md:45`: references a policy
  `chief_of_staff_no_direct_writes` — not validated against any
  `packages/*/policy*` file audited during this work.
- `secret-hygiene.md:17-20`: "nine patterns currently" for the secret
  scanner — pattern count is a moving target and not cited.
- `run-workflow-not-freestyle.md:47-54`: names four specific workflows
  (`grill-me`, `write-a-prd`, `prd-to-plan`, `prd-to-issues`) — none of
  these are validated against a registered workflow list.

**Impact.** Every fictional field in a skill is a future bug report and
an erosion of trust. When the model tells the user "I'm writing memory
M-0423" and there is no M-0423 format, the user sees the model
hallucinating — but the hallucination was written into the skill by us.

**Fix.** Every procedural claim in a skill must cite the file:line of
the code that implements it. Add a `References` section to each skill
body pointing at `packages/core/src/...:LNN`. R3's source-driven
methodology (`agent-skills:source-driven-development`) applies: the
code is the authoritative source, not the skill author's memory.

### [F3-HIGH-04] Cross-skill links use relative paths that break after install

**Standard.** R3 §4.5 (`r3-skills.md:749-759`): "Always use relative
paths from the skill root... To reference another skill, use its
slash-name in prose: 'Follow `/tdd` before writing any implementation
code'."

**Evidence.** Every skill uses the relative-path form:

- `start-every-task.md:64-65`:
  `See also: [recall-before-writing](./recall-before-writing.md), [complete-agent-run](./complete-agent-run.md).`
- `block-when-stuck.md:68-69`: same pattern.
- (All 12 content skills use `./<name>.md`.)

At install time, the files are copied to
`~/.claude/skills/fulcrum/<name>.md`. The relative paths still resolve
because the destination is still flat — but once we fix F3-CRIT-01 and
move to directory-per-skill, `./recall-before-writing.md` will be
`../recall-before-writing/SKILL.md` in the new shape, breaking every
link.

**Impact.** Minor today, major post-restructure. The fix has to land
atomically with the restructure.

**Fix.** Switch every cross-link to the slash-name form: "See also
`/fulcrum-recall-before-writing`" per R3 §4.5.3 (`r3-skills.md:755`).
This is runtime-agnostic: if the model supports slash commands, it'll
load the skill; if not, it'll simulate following it.

### [F3-HIGH-05] No `paths` or `when_to_use` fields used — skills fire on everything

**Standard.** R3 §3.1 / §3.2 (`r3-skills.md:527-595`): `description`
narrows auto-trigger conditions. R3 §1.2 lists `when_to_use` and `paths`
as additional scoping mechanisms. `paths` accepts a glob to restrict
auto-activation to relevant file types.

**Evidence.** No skill uses `paths`. No skill uses `when_to_use`. Every
skill relies solely on `description` matching. For a skill like
`integration-worker-merge-gate`, which is only relevant when the
`integration_worker` role is active, this means the skill fires in
every session the moment anyone mentions "merge" or "review".

**Impact.** False-positive skill loading — the "we have 50 skills
installed and each burns 1.5 KB" problem from R3 §1.5
(`r3-skills.md:184-187`). With 13 skills we're not at the cliff yet,
but as the library grows this gets worse.

**Fix.** Add `paths` for file-type-specific skills (there aren't many
in this library; most are workflow skills). Add `when_to_use` as a
second-pass qualifier for role-specific skills
(`chief-of-staff-response-format`, `integration-worker-merge-gate`,
`invoke-team-only-from-cos`). Consider `disable-model-invocation: true`
for skills that should only fire when the user invokes them directly.

### [F3-HIGH-06] Destructive-side-effect skills don't declare `disable-model-invocation`

**Standard.** R3 §1.6 and §4.6.7 (`r3-skills.md:189-201`, `784`):
destructive skills — `/deploy`, `/commit`, `/release` — should set
`disable-model-invocation: true` so the model can't auto-fire them.

**Evidence.** Our side-effecting skills:

- `integration-worker-merge-gate.md` — recommends calling
  `processMergeQueue` (which merges PRs). Should be user-only.
- `complete-agent-run.md` — finalizes a run and writes a permanent
  memory. Lower severity; arguably safe to auto-invoke because it's
  idempotent per-run.
- `run-workflow-not-freestyle.md` — kicks off workflows with
  side-effects (PRD generation, task creation). Should have per-workflow
  invocation control, which scripts can't give — the skill itself
  should be user-invokable only.

None of these declare `disable-model-invocation`.

**Impact.** The model can auto-fire a skill that recommends merging
code, which in turn makes the user confirm the merge — but the user's
trust in "Claude Code can surprise me with a merge" is the thing skills
should be protecting against.

**Fix.** Add `disable-model-invocation: true` to:
- the rebuilt merge-gate skill (if it survives F3-CRIT-04)
- the rebuilt workflow-runner skill (if it survives F3-CRIT-04)
- any new `/fulcrum-commit`, `/fulcrum-release`, `/fulcrum-deploy`
  skills introduced during rebuild.

---

## Findings — MEDIUM

### [F3-MED-01] No `compatibility` field on any skill

R3 §3.1 (`r3-skills.md:533-539`) allows `compatibility` (≤ 500 chars,
environment requirements). Skills that depend on `fulcrum` CLI or the
Fulcrum MCP server running should declare it:
`compatibility: fulcrum >= 0.1, mcp-server running`. None of ours do.

**Impact.** When the skill fires in a non-Fulcrum workspace, the model
tries `mcp__fulcrum__*` calls and gets "tool not found" errors.

**Fix.** Add `compatibility` with the CLI + server requirement.

### [F3-MED-02] No `metadata.version` set

R3 §3.4 (`r3-skills.md:609-623`) recommends `metadata.version` with
semver. Description changes are API changes (they affect trigger
behavior), and without a version it's impossible to roll forward/back
skills independently of the parent package.

**Fix.** Add `metadata: { version: "0.1.0" }` to each SKILL.md during
rebuild. Bump on any description or substantive body change.

### [F3-MED-03] No pressure-test scenarios for any skill

R3 §9.2 (`r3-skills.md:1159-1175`) and §10.1.15 (`r3-skills.md:1235-1237`)
make pressure tests a MUST: "At least one pressure-test scenario
exists — a recorded prompt that demonstrates the failure the skill
prevents."

**Evidence.** The skills directory has no `tests/` subdirectory, no
recorded scenarios, no A/B pressure tests. Nobody knows whether any of
the 13 skills actually changes behavior when loaded vs unloaded.

**Impact.** We cannot answer "does this skill earn its listing-budget
slot?" without testing. From R3 §8.3 (`r3-skills.md:1126-1131`):

> If you didn't watch an agent fail without the skill, you don't
> know if the skill teaches the right thing.

**Fix.** For each skill that survives the rebuild, ship a
`tests/scenario.md` containing a minimal prompt that reliably triggers
the failure without the skill loaded, plus an expected pass behavior
with the skill loaded. This is how `obra/superpowers/writing-skills`
does it (`r3-skills.md:1161-1170`).

### [F3-MED-04] Body prose is serviceable but not LLM-optimized

R3 §4.2 (`r3-skills.md:692-712`): tables > paragraphs, numbered steps >
flowing prose, anti-rationalization content is materially effective.

**Evidence.** Our bodies are decent prose with some bullet lists. Red
Flags sections are the best part. But:

- No "Quick Reference" tables (R3 §4.1, `r3-skills.md:672-673`).
- No "Core Pattern" one-sentence summaries (R3 §4.1,
  `r3-skills.md:669`).
- Minimal anti-rationalization content. Compare:
  - R3 §4.2.7 (`r3-skills.md:708-712`): "Thinking 'skip TDD just this
    once'? Stop. That's rationalization."
  - Our closest: `block-when-stuck.md:66-67`: "You picked one
    interpretation of an ambiguous spec and wrote code → revert and
    block with both options listed." Close but not named as
    rationalization.
- Heading structure is inconsistent — some skills have "How", others
  "How to verify", others "Gate conditions". R3 §4.2.3 notes headings
  are "search keys" the model greps its own context for.

**Fix.** Standardize heading vocabulary during rebuild.

### [F3-MED-05] No skill uses `` !`cmd` `` preprocessing

R3 §2.2 and §6.3 (`r3-skills.md:252-308`, `929-950`) — embedded shell
`` !`cmd` `` injects live data into the skill body at load time. It's
the cheapest way to keep skills from going stale: a skill that injects
`!fulcrum workspace status` at load time is always current.

**Evidence.** Zero of 13 skills use this. Every mention of current
state is either static prose ("in pi-agent-os include: grill-me,
write-a-prd...") or an instruction to the model to call a tool ("call
`get_workspace_status`").

**Impact.** Stale data. The static workflow list in
`run-workflow-not-freestyle.md:49-54` is already stale relative to
reality (we don't know what's actually registered).

**Fix.** For any skill whose body references "what's currently
registered" or "current state", replace the prose with a `` !`cmd` ``
block that runs at load time.

### [F3-MED-06] No hierarchical categorization

R3 §3.3 (`r3-skills.md:597-608`): "prefer a single flat namespace with
descriptive names rather than nested directories. Both
`anthropics/skills` and `obra/superpowers` use a flat layout." This is
defensible — but as the library grows past ~20 skills, skill-category
prefixes in the `name` field become load-bearing.

**Evidence.** Current names are verb-first and category-free:
`start-every-task`, `recall-before-writing`, `complete-agent-run`. For
13 skills that's fine. For the 40+ skills F3-ISSUE-02 proposes, it's
not.

**Fix.** Consider a naming convention: `fulcrum-run-*`,
`fulcrum-memory-*`, `fulcrum-workflow-*`, `fulcrum-role-*`,
`fulcrum-team-*`. This is also the Option A flat-namespace mitigation
from F3-CRIT-02.

---

## Findings — LOW

### [F3-LOW-01] No LICENSE or compatibility files

R3 §10.2.12 (`r3-skills.md:1258`): "A `LICENSE.txt` file is present for
distributable skills." If Fulcrum skills are going to be shipped as a
plugin or referenced by third parties, each skill directory should
include a `LICENSE.txt` or reference the top-level MIT file.

### [F3-LOW-02] No `argument-hint` on any slash-command-invocable skill

R3 §1.2 (`r3-skills.md:54`): `argument-hint` provides autocomplete for
slash-command use. Low impact (it's just UX) but easy to add during
rebuild.

### [F3-LOW-03] No skills have `model:` or `effort:` overrides

R3 §1.2 (`r3-skills.md:59-60`) / §10.3.5 (`r3-skills.md:1270`):
optional. Not every skill needs this — but a skill like
"audit-entire-repo-for-auth-issues" benefits from `effort: max`. None
of ours do anything at this level. Consider for the rebuild library.

### [F3-LOW-04] Index skill uses `name: fulcrum-skills-index` but file is `index.md`

R3 §3.1 (`r3-skills.md:533`): name must match parent directory. After
F3-CRIT-01 fix, `name: fulcrum-skills-index` implies the directory is
`fulcrum-skills-index/` — but the source file is `index.md`. Either
rename to match or (preferably) delete per F3-CRIT-05.

### [F3-LOW-05] "Red flags" sections are good but could be bulleted as anti-patterns

R3 §4.1 (`r3-skills.md:683-685`) calls these "Red Flags — phrases/symptoms
that mean 'you are about to violate this skill'". Our red flags are
phrased as "You did X → do Y" which is good. Could be tightened to
"If you are about to say 'just this once'" style per R3 §4.2.7.

### [F3-LOW-06] No skills use `context: fork` + `agent: Explore`

R3 §1.2 / §10.3.1 (`r3-skills.md:60-61`, `1262-1263`) — isolated
exploration skills benefit from forked context. A future
"audit-my-workspace" skill or "explore-related-memories" skill is a
good fit. None of the current 13 need it.

---

## Missing skills (at least 20 topics)

Current 13 cover a narrow slice: "start/stop/block a run" + "write/read
a memory" + three role-specific guardrails. A mature Fulcrum skill
library should cover these additional topics (at minimum):

### Memory-layer skills

1. **`fulcrum-recall-query-phrasing`** — how to phrase `recall_memory`
   queries for best retrieval. Specific techniques: goal phrasing, file
   path phrasing, concept-name phrasing, multi-query fanout. Ships
   `scripts/recall.sh` that wraps three queries into one.
2. **`fulcrum-choose-memory-kind`** — decision guide for
   `task_outcome` vs `decision` vs `lesson` with concrete examples.
   Currently buried inside `write-memory-on-completion`.
3. **`fulcrum-memory-tags`** — how to pick tags that will actually
   recall the memory later. Heavy on anti-patterns (empty tags, typo
   tags, generic tags).
4. **`fulcrum-memory-supersession`** — when and how to mark a memory
   as superseded. Requires an actual supersession API (does not exist
   per F3-HIGH-03).
5. **`fulcrum-write-memory-on-bug-fix`** — specific to postmortem
   memories: what to record about a bug fix so the next agent doesn't
   reintroduce it.

### Task / workflow skills

6. **`fulcrum-create-task-well`** — how to write a task title,
   acceptance criteria, and owning-role so `create_task` produces
   usable records. Ships `scripts/task-template.sh` that emits a
   scaffolded task JSON.
7. **`fulcrum-compose-workflow`** — how to write a multi-step
   workflow vs using the generic run machinery. Paired with a
   scripted `scripts/list-workflows.sh` for discovery.
8. **`fulcrum-decompose-prd-to-tasks`** — wraps `prd-to-plan` +
   `prd-to-issues` as a single invocable procedure.
9. **`fulcrum-retry-failed-workflow`** — how to resume a workflow
   from a checkpoint instead of starting fresh.

### Team / delegation skills

10. **`fulcrum-choose-team-template`** — when to use which team
    template. Ships a scripted `scripts/list-templates.sh` that prints
    the current team templates via `list_team_templates`.
11. **`fulcrum-compose-team-template`** — how to write a new team
    template with the right roles and hand-off sequence.
12. **`fulcrum-invoke-team-safely`** — the CoS-only call with the
    right arguments and follow-up polling.
13. **`fulcrum-handoff-packet`** — how to write the handoff from one
    agent run to another so the next agent picks up fast.
14. **`fulcrum-decide-spawn-vs-invoke-team`** — decision guide.
    (Needs `spawn_agent` to exist; see F3-CRIT-04.)

### Role-specific skills

15. **`fulcrum-role-software-engineer`** — playbook for the
    software_engineer role: when to start a run, when to recall, when
    to run tests, when to block, when to complete.
16. **`fulcrum-role-code-reviewer`** — how to produce a
    `review_report` artifact with the right structure so the
    integration_worker can consume it.
17. **`fulcrum-role-tech-lead`** — architecture/research playbook;
    when to write `decision` memories.
18. **`fulcrum-role-integration-worker`** — the rebuilt merge gate
    plus "how to produce a `test_report`".
19. **`fulcrum-role-security-reviewer`** — checklist for security
    audits; ships `scripts/check-secret-patterns.sh` that runs the
    current secret scanner locally.
20. **`fulcrum-register-custom-agent-adapter`** — how to author a new
    adapter in `agent-integration/` so a new agent framework (e.g.,
    Bolt, Cline, Aider) can participate in Fulcrum runs.

### Observability / debugging skills

21. **`fulcrum-diagnose-wip-limit`** — when `start_agent_run` is
    denied by the WIP limiter, how to read `get_workspace_status` and
    decide whether to wait, drain another role, or escalate. Ships
    `scripts/wip-status.sh`.
22. **`fulcrum-read-policy-events`** — how to query the policy event
    log to understand why a tool call was denied.
23. **`fulcrum-diagnose-stale-run`** — what to do when the janitor
    has marked your run stale; how to resuscitate or re-create.
24. **`fulcrum-trace-run-history`** — reconstruct the chain of
    memories, tools, and artifacts for a run to debug a regression.

### Meta / authoring skills

25. **`fulcrum-skill-authoring`** — how to write a new Fulcrum skill
    (meta-skill). References R3 directly.
26. **`fulcrum-test-a-skill`** — pressure-test pattern (§9.2); ships
    `scripts/subagent-test.sh` that spawns a fresh subagent with and
    without the skill and diffs behavior.
27. **`fulcrum-install`** — how to install / update / verify the
    Fulcrum skill library. Ships `scripts/verify-install.sh`.

That's 27 missing topics. At minimum, pick ~20 for the rebuild target.

---

## Scripted-skills refactor (biggest finding)

The single most load-bearing change to this library is moving from
100% prose to ~60-70% scripted — where "scripted" means a skill body
that **runs code on the model's behalf** via `` !`cmd` `` preprocessing
and/or a bundled `scripts/` subdirectory with `allowed-tools` grants.

### Reasoning

Three independent arguments converge:

1. **The user asked for it.** Direct quote from the brief: "mostly
   scripted skills with yaml like in md parts". This is the single
   highest-signal requirement in the audit.
2. **Stale prose is unreliable.** Every hand-maintained list of
   "currently registered workflows" or "current WIP limits" in a
   prose skill body goes stale the moment something changes. A
   `` !`fulcrum workspace status` `` block is always fresh.
3. **Instructions for code the model could run are wasted tokens.** A
   skill that says "call `recall_memory` with goal query, path query,
   and concept query" is better expressed as
   `scripts/recall-fan.sh "$goal"` that runs all three and returns a
   merged result. The model reads one line of instruction instead of
   15 lines of prose.

The R3 reference implementations (§2.3 `codebase-visualizer`, §2.4
`pdf`, §2.5 `docx`, `r3-skills.md:310-440`) are all in this shape.
Our library is the only one the audit compared against that isn't.

### Candidate scripts by skill

Per skill, the deterministic parts that should be pulled out:

| Current skill | Candidate scripts | Embedded `` !`cmd` `` candidates |
|---|---|---|
| `start-every-task` | `scripts/start-run.sh` (calls `list_tasks`, picks or creates, then `start_agent_run`, emits `FULCRUM_RUN_ID`) | `!fulcrum workspace status --brief` at top of body |
| `recall-before-writing` | `scripts/recall-fan.sh <goal>` (runs goal + path + concept queries, merges, deduplicates) | — |
| `complete-agent-run` | `scripts/complete-run.sh <run_id> <summary>` (gathers `files_changed` via git diff, runs tests, emits test counts, calls `complete_agent_run`) | `!git status --short` at top |
| `block-when-stuck` | `scripts/block-run.sh <run_id> <reason>` (validates reason length, calls `block_agent_run`) | — |
| `workspace-status-on-session-start` | `scripts/status.sh` (calls `get_workspace_status` + pretty-prints) | `!scripts/status.sh` at top (**the biggest win**) |
| `chief-of-staff-response-format` | `scripts/cos-block.sh` (emits the Status/Work/Next/Risks skeleton) | `!fulcrum cos context` at top |
| `write-memory-on-completion` | `scripts/write-memory.sh <kind> <scope> <content>` (validates tags, calls `write_memory`) | — |
| `integration-worker-merge-gate` | `scripts/check-merge-gate.sh <worktree_id>` (verifies review + test artifacts exist, returns 0/1) | — |
| `invoke-team-only-from-cos` | — (pure policy; no determinism to automate) | — |
| `run-workflow-not-freestyle` | — | `!fulcrum workflow list` at top (replaces stale static list) |
| `secret-hygiene` | `scripts/scan-secrets.sh <file>` (runs the current secret pattern set locally) | — |
| `heartbeat-during-long-operations` | `scripts/heartbeat-loop.sh <run_id>` (runs in background, heartbeats every 30s until parent exits) | — |

**Summary count:** 9 of 13 skills have at least one deterministic part
pullable to a script. 5 of 13 would benefit from `` !`cmd` ``
preprocessing for fresh context injection. Zero of 13 have either today.

### Scripted-skill template for Fulcrum

Proposed canonical shape for rebuilt skills:

```
~/.claude/skills/fulcrum-<name>/
├── SKILL.md              # frontmatter + orchestration prose
├── scripts/
│   ├── check.sh          # prereq check (cli + server)
│   ├── <action>.sh       # main actions, each cwd-safe
│   └── ...
├── references/           # progressive disclosure targets
│   └── edge-cases.md
├── tests/
│   └── scenario.md       # pressure test per §9.2
└── LICENSE.txt
```

With the SKILL.md body following the R3 §6.1 pattern
(`r3-skills.md:862-907`):

```markdown
---
name: fulcrum-<name>
description: Use when <triggers>. Do NOT use when <negative-triggers>.
compatibility: fulcrum >= 0.1, mcp-fulcrum running
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/* *) Read
metadata:
  version: 0.1.0
---

# Fulcrum <Name>

## Overview
<one paragraph>

## Environment
```!
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

## Steps
1. Run preconditions: `bash ${CLAUDE_SKILL_DIR}/scripts/check.sh`.
2. Run the action: `bash ${CLAUDE_SKILL_DIR}/scripts/<action>.sh "$@"`.
3. Interpret the result per the Outputs section.

## Red flags
- ...

## Related
- See `/fulcrum-<sibling>` for <scenario>.
```

This gives us: trigger-clean description with negative trigger,
compatibility declaration, scoped `allowed-tools`, versioned metadata,
live preprocessing via `!`check.sh``, cwd-safe scripts via
`${CLAUDE_SKILL_DIR}`, standing-instruction language, and a slash-name
cross-link. All of R3's MUSTs satisfied by construction.

---

## Wrong category (move to slash commands / subagents / tools)

R3 §5 (`r3-skills.md:794-839`) is the decision matrix: skill vs
subagent vs MCP tool. Walking our 13 skills through it:

| Current skill | Right category | Why |
|---|---|---|
| `start-every-task` | **Skill (scripted)** | Procedural, runs every turn, fits skill pattern. Keep. |
| `recall-before-writing` | **Skill (scripted)** | Procedural + benefits from a fan-query script. Keep. |
| `complete-agent-run` | **Skill (scripted)** | Procedural, benefits from git-status-aware script. Keep. |
| `block-when-stuck` | **Skill (scripted, `disable-model-invocation: true`)** | Side-effecting; user-only is safer. |
| `workspace-status-on-session-start` | **Skill (scripted, `context: fork` optional)** | Pure read-only. Perfect for `!status.sh` preprocessing. Keep. |
| `chief-of-staff-response-format` | **Subagent** (`.claude/agents/chief-of-staff.md`) not skill | This is a role definition, not a procedure. The output contract (Status/Work/Next/Risks block) is what a subagent system prompt enforces, and the role only applies when the user is explicitly operating as CoS. R3 §5 says "I need a specialist with its own context budget → subagent." |
| `write-memory-on-completion` | **Skill (scripted)** | Procedural. Keep. |
| `integration-worker-merge-gate` | **MCP tool** (`merge_gate_check`) not skill | The entire skill reduces to "verify these three conditions, then merge". That's an MCP tool signature: `merge_gate_check(worktree_id) → {ok, reasons}`. Wrapping it in prose adds nothing. R3 §5: "I need to read from / write to an external system with a contract → MCP tool." Keep a thin skill that tells the model "use `merge_gate_check` before `processMergeQueue`" but the logic belongs in the tool. |
| `invoke-team-only-from-cos` | **Policy / hook, not skill** | This is a permission gate, not a procedure. The PreToolUse hook should deny the call for non-CoS roles, and the denial message should explain what to do instead. A skill can't enforce a policy; it can only beg the model to comply. R3 §10.4.7 (`r3-skills.md:1285-1286`) agrees: "Destructive skills with `disable-model-invocation` unset" — this belongs in the hook layer. |
| `run-workflow-not-freestyle` | **Skill (scripted) + MCP tools** | Keep the skill as meta-guidance, but each workflow (`grill-me`, `write-a-prd`, etc.) should be its own MCP tool or its own skill with `disable-model-invocation: true`. The "meta-skill that says use workflows" is fine as prose. |
| `secret-hygiene` | **Hook + skill** | The PreToolUse hook is the enforcer (and R3 §4.6 anti-pattern list §10.4.10 confirms this). The skill is a thin "here's what to do when you hit the hook". Hook is primary; skill is secondary. |
| `heartbeat-during-long-operations` | **Skill (scripted)** or **hook** | Could be a timer hook that auto-heartbeats while a run is active. Or a scripted skill that launches a background `heartbeat-loop.sh`. Either beats "call `heartbeat` every 30s" prose. |
| `index` | **README, not skill** | See F3-CRIT-05. Delete as a skill. |

**Summary:** of 13 current skills, only 7-8 are genuinely the right
category. The rest are policy (hook), data (MCP tool), or role
definition (subagent) in the wrong wrapper.

---

## Issues to plan

- **F3-ISSUE-01 — Rebuild skill library around scripted pattern.**
  Atomic restructure: convert all surviving skills to
  `<name>/SKILL.md` directories with `scripts/`, `references/`,
  `tests/`, and `LICENSE.txt`. Update `installClaudeSkills()` to copy
  directory-wise. Switch cross-links to slash-name form. Add
  `allowed-tools`, `compatibility`, `metadata.version` to every
  frontmatter. Source: F3-CRIT-01, F3-CRIT-02, F3-CRIT-03, F3-HIGH-01,
  F3-HIGH-04, F3-MED-01, F3-MED-02. → plan.
- **F3-ISSUE-02 — Ship 20+ new skills for missing domains.** See
  "Missing skills" section. Prioritize memory-layer and role-specific
  skills first. → plan.
- **F3-ISSUE-03 — Audit MCP tool surface against skill recommendations.**
  F3-CRIT-04: seven of thirteen skills reference tools that do not
  exist. Either add the tools (spawn_agent, dispatch_agent,
  escalate_run, list_artifacts, list_workflows, run_script,
  review_artifact, merge_queue family) or rewrite the skills against
  the 18-tool surface that exists today. Decision required before
  F3-ISSUE-01 can land. → plan.
- **F3-ISSUE-04 — Ship skills as a Claude Code plugin.** F3-CRIT-02:
  `~/.claude/skills/fulcrum/*.md` is a non-standard location. The
  right long-term shape is a plugin bundle that ships skills + hooks +
  MCP server together with `plugin-name:skill-name` namespacing. →
  plan.
- **F3-ISSUE-05 — Move chief-of-staff out of skills and into
  subagents.** F3-CRIT-05-adjacent / wrong-category table:
  `chief-of-staff-response-format.md` is a role definition, not a
  procedure. Create `.claude/agents/fulcrum-chief-of-staff.md` and let
  the skill become a thin "use the fulcrum-chief-of-staff subagent"
  pointer. → plan.
- **F3-ISSUE-06 — Move policy enforcement out of skills and into
  hooks.** F3-CRIT-04-adjacent: `invoke-team-only-from-cos` and
  `secret-hygiene` are policies, not procedures. The hook layer should
  enforce them; skills can offer recovery guidance but can't enforce.
  → plan.
- **F3-ISSUE-07 — Add pressure tests for every skill.** F3-MED-03:
  each surviving skill ships a `tests/scenario.md`. Build a
  `scripts/subagent-test.sh` that runs the scenario with/without the
  skill and diffs the outcomes. Use R3 §9.2 methodology. → plan.
- **F3-ISSUE-08 — Source-drive every procedural claim in every
  skill.** F3-HIGH-03: eliminate invented schema / fictional config /
  stale data. Every procedural claim cites `packages/*/*.ts:LNN`.
  Add a linter that fails CI if a skill mentions a function name that
  doesn't exist in the repo. → plan.
- **F3-ISSUE-09 — Add `disable-model-invocation` / `paths` /
  `when_to_use` scoping to each skill.** F3-HIGH-05, F3-HIGH-06. →
  plan.
- **F3-ISSUE-10 — Document skill-authoring for Fulcrum.** Missing
  skill `fulcrum-skill-authoring` (meta-skill). Embeds R3 §9 workflow.
  → plan.
- **F3-ISSUE-11 — Delete `index.md` as a skill; keep as README.**
  F3-CRIT-05. → plan.

---

## Rebuild vs retrofit decision

**Verdict: REBUILD, not retrofit.**

The retrofit path would require, for each of the 13 existing files:

1. Move `<name>.md` → `<name>/SKILL.md` (F3-CRIT-01)
2. Update the installer (F3-CRIT-02)
3. Convert prose to scripted (F3-CRIT-03)
4. Remove or reimplement references to non-existent tools (F3-CRIT-04)
5. Add `allowed-tools`, `compatibility`, `metadata.version` (F3-HIGH-01,
   F3-MED-01, F3-MED-02)
6. Rewrite descriptions with negative triggers (F3-HIGH-02)
7. Replace invented schema/config with source-cited references
   (F3-HIGH-03)
8. Switch cross-links to slash-name form (F3-HIGH-04)
9. Add `paths` / `when_to_use` / `disable-model-invocation` as
   appropriate (F3-HIGH-05, F3-HIGH-06)
10. Ship pressure tests (F3-MED-03)

That is effectively a rewrite of each file. There is no file where only
1-2 findings apply — every file is touched by 8+ findings. At that
point, the skeleton being preserved (section order, red-flag phrasing,
see-also links) is itself the thing slowing us down, because the
section order is the *wrong* section order per R3 §4.1.

Furthermore, the wrong-category analysis says **at least four of the 13
skills shouldn't be skills at all**: `index` (README),
`chief-of-staff-response-format` (subagent), `integration-worker-merge-gate`
(MCP tool wrapper), `invoke-team-only-from-cos` (hook). Retrofitting
these just to delete them is wasted work.

**Rebuild plan, 3 phases:**

- **Phase 1 (prerequisites).** Decide the MCP tool surface
  (F3-ISSUE-03). Decide plugin vs flat install (F3-ISSUE-04). Decide
  which current skills get demoted to subagent/hook/tool
  (F3-ISSUE-05, F3-ISSUE-06). Output: a target list of ~20-27 skills
  with categorization and MCP-tool dependencies resolved.
- **Phase 2 (canonical template + scripts).** Build one gold-standard
  scripted skill (`fulcrum-workspace-status` is the ideal pilot — it's
  read-only and the `!status.sh` preprocessing story is clean).
  Validate end-to-end: install, load, trigger, execute. This is the
  template for everything else.
- **Phase 3 (bulk authoring).** Author the remaining ~20 skills using
  the Phase 2 template. Ship pressure tests in parallel
  (F3-ISSUE-07). Source-drive every procedural claim
  (F3-ISSUE-08). Add the meta-skill (F3-ISSUE-10).

Estimated size: Phase 1 is ~2 days of decisions, Phase 2 is ~1 day of
engineering, Phase 3 is ~1-2 weeks of skill authoring + pressure
testing at ~2-3 skills/day.

The deliverable at the end of Phase 3 is a skill library that:

- Uses the directory-per-skill shape per R3 §1.3
- Ships bundled scripts per R3 §2 and §6.1
- Has source-cited procedural claims per R3 §9
- Has pressure tests per R3 §9.2
- Installs as a Claude Code plugin per R3 §1.4
- Contains 20-27 skills per the missing-skills inventory
- Contains zero references to tools that don't exist

---

## Appendix A — R3 compliance checklist (all 13 current skills)

From R3 §10.1 (`r3-skills.md:1199-1238`), the 15 MUSTs, tallied:

| MUST | Passing / 13 |
|---|---|
| 1. Has name + description | 13 / 13 |
| 2. Name matches parent directory | **0 / 13** (no parent directory) |
| 3. Description ≤ 1024 chars, "Use when…" | ~6 / 13 (partial) |
| 4. Description has no workflow summary | ~10 / 13 |
| 5. Description has ≥ 1 negative trigger | **0 / 13** |
| 6. Body ≤ 500 lines | 13 / 13 |
| 7. Every supporting file referenced from SKILL.md | n/a (no supporting files) |
| 8. `allowed-tools` narrowly scoped | **0 / 13** (field absent) |
| 9. Side-effecting skills have `disable-model-invocation: true` | **0 / 13** |
| 10. Scripts are cwd-safe | n/a (no scripts) |
| 11. Scripts have no install step | n/a |
| 12. Body uses standing-instruction language | ~13 / 13 |
| 13. Skill directory in canonical location | **0 / 13** (flat files, not directories) |
| 14. No contradiction with CLAUDE.md | ~13 / 13 (not cross-validated) |
| 15. Pressure-test scenario exists | **0 / 13** |

Raw MUST-pass count: 13 × 15 = 195 cells, ~55 pass, ~115 fail, ~25 n/a.
Pass rate on applicable cells: ~32%.

From R3 §10.2 SHOULDs and §10.3 MAYs: near-zero adoption.

From R3 §10.4 anti-patterns:
- **§10.4.3 Orphan supporting files** — n/a
- **§10.4.4 Skills duplicating CLAUDE.md** — not cross-validated
- **§10.4.5 Narrative-body skills** — partial; red flags sections
  sometimes drift narrative
- **§10.4.7 Destructive skills without `disable-model-invocation`** —
  hit by `integration-worker-merge-gate` and `run-workflow-not-freestyle`
- **§10.4.8 Skills > 500 lines** — not hit (we're small)
- **§10.4.9 Skills with no pressure test** — hit by all 13
- **§10.4.10 Overlapping descriptions** — partial hit between
  `start-every-task` and `workspace-status-on-session-start`
- **§10.4.13 Descriptions mentioning the skill by name** — partial hit
  (`chief-of-staff-response-format` literally has "chief_of_staff" in
  the description)

---

## Appendix B — R3 section map used in this audit

| R3 section | Topic | Lines used | Findings citing |
|---|---|---|---|
| §1.1 | What a skill is | 14-38 | CRIT-01, CRIT-05 |
| §1.2 | Frontmatter reference | 45-86 | HIGH-01, HIGH-05, MED-01, MED-02, LOW-02, LOW-03 |
| §1.3 | Directory layout | 87-121 | CRIT-01 |
| §1.4 | Discovery / precedence | 123-151 | CRIT-01, CRIT-02 |
| §1.5 | Progressive disclosure | 153-187 | CRIT-05, HIGH-05 |
| §1.6 | Invocation control | 189-201 | HIGH-06 |
| §2.1-2.3 | Scripted skills pattern | 223-354 | CRIT-03 |
| §2.5 | docx reference impl | 420-440 | HIGH-02 |
| §3.1-3.5 | Frontmatter best practices | 527-648 | HIGH-01, HIGH-02, MED-02, MED-06 |
| §4.1-4.6 | Body best practices | 656-790 | HIGH-04, MED-04 |
| §5 | Skill vs subagent vs MCP | 794-839 | wrong-category table |
| §6.1-6.4 | Scripted pattern deep-dive | 846-979 | CRIT-03, scripted refactor |
| §8.1-8.3 | What works vs not | 1083-1131 | strengths, MED-03 |
| §9.1-9.3 | Authoring workflow | 1135-1194 | MED-03, HIGH-03 |
| §10.1 | MUST checklist | 1199-1238 | Appendix A |
| §10.4 | Anti-patterns | 1275-1299 | HIGH-06, MED-03, Appendix A |

---

## Appendix C — Source file references

Code / config this audit grounds itself in:

- `agent-integration/skills/start-every-task.md:1-66`
- `agent-integration/skills/recall-before-writing.md:1-69`
- `agent-integration/skills/complete-agent-run.md:1-62`
- `agent-integration/skills/block-when-stuck.md:1-70`
- `agent-integration/skills/workspace-status-on-session-start.md:1-60`
- `agent-integration/skills/chief-of-staff-response-format.md:1-70`
- `agent-integration/skills/write-memory-on-completion.md:1-79`
- `agent-integration/skills/integration-worker-merge-gate.md:1-63`
- `agent-integration/skills/invoke-team-only-from-cos.md:1-57`
- `agent-integration/skills/run-workflow-not-freestyle.md:1-72`
- `agent-integration/skills/secret-hygiene.md:1-61`
- `agent-integration/skills/heartbeat-during-long-operations.md:1-67`
- `agent-integration/skills/index.md:1-61`
- `agent-integration/install.ts:378-413` (`installClaudeSkills()`)
- `agent-integration/install.ts:150, 663, 673, 707` (install metadata)
- `docs/audit/codebase/c1-inventory.md:1012-1044` (skill inventory)
- `docs/audit/research/r3-skills.md:1-1348` (full R3 spec)

End of F3 audit.
