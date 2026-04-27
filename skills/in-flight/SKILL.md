---
name: in-flight
description: Write vault/project-specific/<project>/in-flight.md with a one-line summary of mid-thought state, the current ISO-8601 timestamp, and current git status. Triggered by /in-flight <one-line>. No reasoning required — this is mechanical capture.
---

# In-flight (`/in-flight <one-line>`)

## When to use

The user is stopping mid-thought — work that isn't a decision yet, isn't a closeable task, but matters for resuming. Examples:
- "halfway through refactor X, blocked on Y"
- "considering whether Z is the right approach, need to think more"
- "discovered an edge case but haven't decided how to handle it"

May be invoked directly by the user, or proposed by `/wrap`'s in-flight heuristic when uncommitted changes exist with no closing decision.

## Workflow

This is a mechanical skill — no reasoning, no future-behavior test, no confirmation needed. Just capture the state.

### 1. Build the file

```markdown
# In-flight state

**At:** <ISO-8601 UTC timestamp>
**Summary:** <one-line argument from user>

## Working tree at the time
```
<output of `git status --short`>
```

## Last commit
<output of `git log -1 --oneline`>
```

### 2. Write to disk

```bash
PROJECT=$(basename "$PWD")
mkdir -p "$HOME/vault/project-specific/$PROJECT"
cat > "$HOME/vault/project-specific/$PROJECT/in-flight.md" <<EOF
<rendered content from step 1>
EOF
```

### 3. Stage in vault

```bash
git -C ~/vault add "project-specific/$PROJECT/in-flight.md"
git -C ~/vault commit -m "in-flight: $PROJECT — <first 40 chars of summary>"
```

The Stop hook handles the push. No need to push immediately.

## Auto-deletion

You do **not** delete `in-flight.md`. Two other things delete it:
1. The next session's `/wrap` removes it after the in-flight scenario resolves and the user confirms it's no longer relevant.
2. A commit that closes the in-flight scenario (e.g. completing the refactor) — the user is responsible for `git rm`-ing the file in that case, or `/wrap` catches it next time.

## Output to user

```
in-flight captured: ~/vault/project-specific/<project>/in-flight.md
```

That's it. No further reasoning, no follow-up questions.
