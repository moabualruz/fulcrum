# Handover: Automate Memory Recording & Retrieval via Hooks

**Status**: Designed, not implemented. Plan is ready; next session should implement + validate.
**Plan file**: `~/.claude/plans/curried-dazzling-toucan.md` (copy included below for reference).
**Related code**: `packages/cli/src/hooks.ts`, `packages/cli/src/index.ts`, `agent-integration/{gemini,codex,pi}/`.

---

## Why this matters

Today, Fulcrum agents must **manually** call `recall_memory` and `write_memory` tools to interact with the memory system. Every call costs tokens and depends on the agent remembering to do so. The user wants the hooks/plugins/extensions layer to **automate** most memory operations so that:

1. Agents don't waste tokens on explicit memory tool calls for routine work.
2. Memory gets written automatically as a side effect of real work (edits, commits, task completion).
3. Relevant memories get injected at the right hook points — not preemptively at session start.
4. Agents retain the ability to call memory tools directly when they want deliberate, intent-driven retrieval.

The user's framing: *"the extensions and plugins and hooks should automate the memory recording and retrieval and smart injection as much as possible."*

---

## What's been decided (do not re-litigate)

### Hook timing (verified from source)

| Hook | Fires | Has user message? | Can inject context? |
|------|-------|---------------------|-----|
| Claude Code `SessionStart` | BEFORE user types | No | Yes (system text) |
| Claude Code `PreToolUse` | Before each tool call | n/a | **No — approve/block only** |
| Claude Code `PostToolUse` | After each tool call | n/a | No (record only) |
| Claude Code `Stop` | End of agent turn | n/a | No (record only) |
| Gemini `BeforeAgent` | After user message | **No (only conversationId)** | Yes (`additionalContext`) |
| Gemini `PreToolUse` | Before each tool call | n/a | Yes (`additionalContext`) |
| Codex `PreToolUse` / `PostToolUse` | Before/after tool call | n/a | Yes (`additional_context`) |

**Key consequence**: 
- `SessionStart` cannot do intent-based recall — user hasn't spoken yet. Full recall there is wasteful.
- Claude Code `PreToolUse` cannot inject context — injection has to happen elsewhere for Claude.
- Gemini/Codex `PreToolUse` on `Write`/`Edit` tools is the **best** injection point — we know the file path, we can recall memories scoped to that file.

### Design (see plan file for detail)

1. **PostToolUse (all agents)**: fix `runPostHook()` to extract actual `file_path` + content/command values from `toolInput` (currently only logs keys). Write meaningful `tool_trace` memories.
2. **Stop hook (Claude Code)**: new `runStopHook()` auto-writes `task_outcome` memory from final assistant message.
3. **Gemini `BeforeAgent`**: inject top 3 generic project memories (`kind IN ('summary','decision')`) as lightweight orientation. No file-specific recall here.
4. **Gemini/Codex `PreToolUse` on Write/Edit**: recall memories scoped to the target `file_path`, return as `additionalContext`.
5. **`SessionStart`**: minimal — just register the run + tiny project header. **No recall.**
6. **Claude Code**: accept we cannot inject via hooks. Maximize value by improving the **write** side (PostToolUse, Stop) — this benefits every future session.

---

## What's already shipped (committed)

- Schema consolidated into a single `packages/core/src/db/schema.ts` (54 migration files deleted).
- Memory pipeline fixed: `vec_memories` uses `memory_id TEXT PRIMARY KEY`, RRF scoring keyed by string `memory_id` end-to-end, embedder `this`-binding fix in `recall.ts` and `write.ts`.
- 249 Claude Code session JSONLs imported as vault memories (script: `scripts/import-claude-sessions.ts`).
- Agent installer standardized on native channels:
  - Codex: `codex mcp add` CLI, skills copied to `~/.codex/skills/`, hooks via `config.toml`.
  - Smoke test fixed: `FULCRUM_NO_MONITOR=1` + explicit `resolveCliPath()`.
- `.gitignore` now ignores `.codex/ .cursor/ .opencode/ .windsurf/` (install artifacts).
- See commit `fe6cbc2` for the consolidated work.

## Open questions for research (do this first in the new session)

The user specifically asked: **"check how does prior-art and hermis go about their memory"** — these are likely:

- **"prior-art"** → most likely **OpenCode** (sst/opencode), but could also mean the emerging "OpenClaude" OSS fork. Start with `https://github.com/sst/opencode` and grep their repo for `memory`, `recall`, `embedding`, `hook`.
- **"hermis"** → most likely **prior art** — ambiguous; could be:
  - NousResearch/prior art-series models (less likely — these are models, not memory systems).
  - prior art memory library if such exists.
  - Some other agent framework the user has in mind.
  - Confirm with the user on session start if the identity is unclear.

What to extract from each:
1. When do they write memory (hook points)?
2. When do they recall memory (injection points)?
3. How do they avoid token waste on irrelevant recalls?
4. Do they distinguish generic project context from file-scoped context?
5. How do they handle the "user hasn't spoken yet" problem at session start?

Write up findings in `docs/research/memory-patterns-hooks-and-scoring.md` and cross-reference with the plan before implementing — their patterns may change design choices.

---

## Key files to modify (from the plan)

| File | Change |
|------|--------|
| `packages/cli/src/hooks.ts` | Fix `runPostHook()` to extract real values; add `runStopHook()` |
| `packages/cli/src/index.ts` | Wire `Stop` event to `runStopHook()` in `hook claude` handler |
| `agent-integration/gemini/hooks/hooks.json` | Add `BeforeAgent` + enhance `PreToolUse` |
| `agent-integration/gemini/hooks/before_agent.ts` (new) | Generic project recall → `additionalContext` |
| `agent-integration/gemini/hooks/pre_tool_use.ts` (update) | File-scoped recall for Write/Edit |
| `agent-integration/codex/config.toml` | Add PreToolUse hook entry |
| `agent-integration/pi/cockpit/index.ts` | Inherits PostToolUse improvement |

## Verification plan

1. **PostToolUse**: Edit a file in Claude Code → `fulcrum action exec recall_memory '{"query":"<path>"}'` returns memory with real path + content preview.
2. **Stop hook**: End a Claude Code session → new `task_outcome` memory exists.
3. **Gemini BeforeAgent**: Start Gemini in project dir → `additionalContext` contains project summary memories (≤ 500 tokens).
4. **Gemini PreToolUse Write**: Trigger file write in Gemini → top 2 file-scoped recalls appear as context.
5. **Token audit**: Compare before/after — each auto-injection < 500 tokens; manual `write_memory` calls should mostly disappear.

---

## Starter prompt for the new session

```
Resume work on automating Fulcrum's memory recording/retrieval via hooks.

Start here:
1. Read docs/handover/memory-automation-via-hooks.md for full context.
2. Read ~/.claude/plans/curried-dazzling-toucan.md for the implementation plan.
3. FIRST TASK (research, before coding): the user previously said "check how does
   prior-art and hermis go about their memory" — likely OpenCode (sst/opencode)
   and prior art (identity unclear, confirm if needed). Investigate their hook/memory
   patterns, write findings to docs/research/memory-patterns-prior-art-hermis.md,
   and report back BEFORE touching code. Cross-check whether their approach
   changes our design.
4. THEN implement the plan in this order:
   a. Fix runPostHook() in packages/cli/src/hooks.ts to extract real file_path
      and content/command values (not just parameter keys).
   b. Add runStopHook() and wire it into `fulcrum hook claude` dispatch.
   c. Update Gemini hooks (BeforeAgent for generic recall; PreToolUse Write/Edit
      for file-scoped recall).
   d. Mirror PreToolUse pattern into Codex config.toml.
   e. Run the verification plan in the handover doc.
5. Throughout: respect the "global-only data" hard rule — never write DB/vault
   under the project dir. Use globalDataDir() from fulcrum-core.

Constraints:
- Claude Code PreToolUse CANNOT inject context. Don't try to make it work there.
- SessionStart fires before the user types. Do NOT do intent-based recall there.
- Keep each injection under 500 tokens; skip if top match score < 0.5.
- Commit in logical chunks (one per phase above), not all-at-once.
```
