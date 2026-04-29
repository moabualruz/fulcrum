# Subagent workflow & development — captured user guidance

> Raw guidance extracted from session 2026-04-28/29. Source for the future generic
> cross-agent skill on subagent orchestration (see HANDOVER.md §7 step 2). Not a
> finished doc — a notes file to ground the research + skill-authoring task.

## Verbatim / paraphrased user instructions

**On parallel work and time use**

- "Run tasks in parallel agents… use full 6 sub agents at all time and you do work too."
- "Always plan a parallel execution while maintaining dependencies and order."
- "You can split tasks between yourself and subagents so you do not just sit here waiting."
- "Do not stop or pause until all is finished."
- "If the user specifies that they want you to run agents in parallel, you MUST send a single message with multiple Agent tool use content blocks." (harness-level rule, but reinforced by user.)

**On model selection and effort**

- "Run parallel agents with smaller or equal models and with efforts and thinking levels also assigned depending on the task complexity you are delegating."
- Implication: pick haiku for low-effort mechanical edits; sonnet for design + multi-file refactor; opus only when reasoning depth is the bottleneck.

**On reviewing subagent output**

- "You also always have to review the work of subagents."
- Trust-but-verify the report. The agent describes intent; the actual output and edited files/artifacts are truth.
- Review every subagent-delivered output path, patch, artifact, and claimed file, whether or not it is tracked by git, staged, or committed.
- Git is one inspection tool, not the review boundary. Check `git status` + `git diff --stat` for tracked/untracked work, but also inspect generated files outside git, logs, result files, installed agent config, copied skill directories, and any path the subagent says it touched.
- Check: subagent final report vs actual files/artifacts, `git status`, `git diff --stat`, targeted file reads, `fd`/`rg` for claimed paths, independent `bun run ci`, tests count vs claim, and installed/configured state when the task changes runtime setup.
- Caught examples in this session: `mcp.test.ts` claimed but never written; `fulcrum init` watcher impl overrode vendor output paths and hardcoded extension filters.

**On research before implementation**

- "Research online then plan then fix."
- Before integrating a vendor tool, fetch its README and confirm the exact install / index / hook / uninstall commands. `gh api repos/<org>/<repo>/readme --jq .content | base64 -d` is reliable.
- Don't extrapolate from training data; APIs and command surfaces drift.

**On vendor adherence**

- "If they have official tools or plugins or extensions or skills they should be used over fucking authoring anything ourselves, and we should manage installing and uninstalling it for all the ways how they officially document it."
- "Always follow vendor instructions as much as we can."
- "Mimic to other agents that don't have full support, no new content."
- Mirror policy: copy vendor bytes verbatim into agents the vendor doesn't ship for; never re-author.

**On scope discipline**

- "We do not accept stubs or half done full implementation nothing to defer or reduce in priority all should be done in full."
- "Why the fuck are we overriding watcher exported files path and why the fuck we are controlling the extensions it would/should watch?" — do not invent control surfaces the vendor already owns (output paths, filter globs, hook event names).
- "Why the fuck is the index command in a file that manages installing and uninstalling shit?" — separate concerns; one file = one responsibility.

**On reusing existing repo systems**

- "Fucking utilize what we have already." — when a mechanism exists (e.g. `rules/AGENTS.md` sentinel splice, `skills/upstream.lock`, mcp-registry), extend it instead of inventing a parallel pipe.
- "Fulcrum has no native functionality yet" — every behavioral rule today is a vendor-tool convention, not Fulcrum native. The rules system is the universal vendor-rule pipe, not a Fulcrum-only thing.

**On honest reporting**

- "Why are you claiming all is done and that we have to move somewhere when shit that is documented is not done in project and not fucking installed to agents?" — never mark a task done unless every subitem is verified. If a sub-agent reports "ok" but the claim doesn't match the working tree or doctor output, the task is not done.

**On not assigning work to the user**

- Never frame remaining work as "next steps for you" or "manual follow-ups". The user drives; the assistant proposes options and executes when authorized.
- Acceptable phrasings: "I can do X if you want", "let me know if you'd like Y", "want me to push?". Not: "you should run X".

**On commit + push discipline**

- Commit per logical change with conventional-commit format (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`).
- Subject ≤ 72 chars; body explains why, not what.
- Push after each cohesive batch. No PRs in current operating mode.
- Force-push to `main` only with explicit user approval (`git push --force-with-lease`).

**On not adding unapproved work**

- Don't start work that isn't in `HANDOVER.md` or explicitly approved this session.
- If a useful improvement appears mid-work, propose first — name what, why, what it touches — and wait.
- Bug fixes for regressions just introduced are recovery, not new scope.

## Patterns observed (concrete, not abstract)

**Pattern: 6 parallel subagents for independent work**

Worked well for:
- Wave-3 audits (28-skill upstream check, capabilities-tools manage gap, install/uninstall completeness, top-level docs drift, hooks drift, agents+context drift)
- Vendor-research before init redesign (per-tool README fetch + plan section)

Failure modes seen when parallelism was wrong:
- Multiple agents touching the same file (`HANDOVER.md`, `README.md`, `src/cli/install.ts`) — last-write-wins clobbered earlier work.
- An agent's claim of test count (e.g. "238 → 248") didn't match the actual diff (the file the agent said it created didn't exist).

Mitigation:
- Partition work by file ownership: pre-allocate which files each agent may modify.
- Always run `git status` + `git diff --stat` + `bun run ci` between agent batches.

**Pattern: research → plan → implement, separated**

When user said "research online then plan then fix" the workflow that worked:
1. Research subagent: WebFetch vendor READMEs; output a structured per-tool fact sheet.
2. Plan subagent: consume the research; output a concrete file:function diff list with explicit DO and DELETE items.
3. Implement subagent: fed the plan as spec; produces code + tests; CI green before reporting.

The pattern of letting one agent do all three at once (research-and-implement-now) led to overengineering (watchexec wrappers, output-path overrides) because the implementer wasn't constrained by an upstream-aligned plan.

**Pattern: fail-soft per tool**

Vendor commands fail individually — log warning, continue. One missing tool ≠ pipeline failure.

**Pattern: scratch-HOME-only for tests**

Never touch real `$HOME` from tests. Always `mktemp -d` for the agent rootDir. Mock `Bun.spawn` / `proc.run` instead of real subprocess.

## Things to research online for the skill

- Anthropic Agent SDK + Claude Code subagent best practices (streaming, structured output, retry, partial output)
- Claude Code's `Agent` tool: foreground vs background, isolation modes, when to delegate vs do directly
- OpenAI / Codex multi-agent patterns (if any official surface exists)
- Cross-agent compatibility: how does each of our 5 agents (Claude Code, Codex, Gemini, OpenCode, Pi) handle subagent dispatch?
- Parallel orchestration patterns (map-reduce, fan-out, supervisor-worker)
- Token-budget management for parallel agents
- How to give a subagent enough context to be self-contained without overwhelming it
- Hand-off / review checkpoints between agents
- Failure isolation: how a single failing agent shouldn't poison the whole batch

## Cross-agent skill output (target)

Once the research lands, produce:

- `skills/subagent-orchestration/SKILL.md` — concise trigger + invocation + patterns + anti-patterns
- `skills/subagent-orchestration/references/*.md` — progressive section detail (parallel-vs-serial, model-selection, review-protocol, vendor-research-flow, scope-discipline, …)
- 18–21-entry trigger eval set per the existing convention
- caveman compression, lint, eval coverage matching the existing 27 authored skills

## Cross-refs

- `docs/contributing.md` — workflow + commit conventions
- `docs/developer-guide.md` — repo internals + adding skills
- `skills/_template/SKILL.md` — required shape
- `evals/README.md` — eval harness contract
