---
name: secret-hygiene
description: Never include credentials, API keys, tokens, or passwords in tool inputs or memory writes. Applies to every tool call that accepts free-form text from the agent.
---

# Secret hygiene

Never include credentials, API keys, tokens, or passwords in:

- Tool inputs (especially `Bash`, `Write`, `Edit`, and any MCP call)
- Memory writes (`write_memory` content or tags)
- Commit messages or PR bodies
- Block / escalate / complete reasons or summaries

The PreToolUse hook scans tool inputs and will deny any that look like
secrets (nine patterns currently: AWS keys, GitHub tokens, generic
`API_KEY=...`, bearer tokens, private keys, Slack tokens, database
URLs with inline creds, JWTs, and `password=...` forms). A denial is
logged as a `secret_redacted` policy event with the tool name and
approximate location.

## When this applies

- You need an API key to call an external service
- A config file has `DATABASE_URL=postgres://user:pass@host/db`
- A shell command would echo a token into logs
- A test fixture contains a sample credential
- You are summarising a file that contains secrets

## What to do instead

When you need a secret to proceed:

1. Call `fulcrum action exec block_agent_run` with reason
   `"needs secret: <NAME>"` — e.g., `"needs secret: STRIPE_WEBHOOK_SECRET
   for integration tests in packages/billing"`.
2. Chief_of_staff (or a human operator) supplies the value by setting an
   env var on the worker adapter before the next run starts.
3. You read it from `process.env.NAME` inside the code you're writing —
   never from the prompt.

## Handling files that contain secrets

- Do not paste their contents into tool inputs or memories.
- Reference them by path only: `"configured in .env.local"`.
- If a secret is committed to the repo by accident, block the run with
  reason `"secret committed: <path>"` and escalate — rotation is a
  human decision.

## Red flags

- You pasted a key into a `Bash` command so you could "just test it" →
  the hook denied it; the attempt is logged. Do not retry.
- You wrote a memory whose content includes a literal token → delete
  it (or ask CoS to) and redo with the secret removed.
- You think the pattern scanner is wrong and want to bypass it → don't;
  file it as feedback via a `lesson` memory.

See also: [block-when-stuck](../block-when-stuck/SKILL.md),
[write-memory-on-completion](../write-memory-on-completion/SKILL.md).
