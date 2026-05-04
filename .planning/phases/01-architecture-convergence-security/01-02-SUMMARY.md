# 01-02 Summary: Patch Security Vulnerabilities (SEC-01 through SEC-04)

## Status: DONE

## What was done

### SEC-01: Webhook secrets encrypted at rest
Already implemented prior to this plan. Webhook entity uses `encryptedSecret` field.
- **Create/Update**: plaintext encrypted via `nacl.secretbox` (vault.ts) before persistence
- **List/Get**: always returns `"****"` — raw ciphertext never exposed to callers
- **Dispatcher**: decrypts only internally for HMAC signing (`resolveWebhookSecret`)
- **Fallback**: `plain:` prefix for dev/test envs without keyring configured

No code changes needed — verified implementation is correct.

### SEC-02: cliPath allowlist before spawn
`src/trpc/routers/agents.ts` — `testProfile` mutation spawned arbitrary binaries
from DB-stored `cliPath` without validation.

**Fix**: Added `assertCliPathAllowed()` that checks cliPath against:
1. Registered profile cliPaths from the agent registry (`claude`, `codex`, `copilot`, `gemini`, `opencode`, `pi`)
2. `FULCRUM_AGENT_CLI_ALLOWLIST` env var (comma-separated, for test/dev extensions)
3. Basename matching (e.g. `/usr/bin/claude` matches allowlisted `claude`)

Throws `FORBIDDEN` TRPCError if path not in allowlist.

### SEC-03: Semgrep findings (dynamic import workarounds)
Three `new Function("specifier", "return import(specifier)")` patterns found:
- `src/server/trpc/middleware/otel.ts:55` — hardcoded `@opentelemetry/api` specifier
- `src/auth/passkey.ts:65,178` — hardcoded `@simplewebauthn/server` specifier (already annotated)

**Fix**: Added `eslint-disable` + safety comment to `otel.ts`. All three are bundler
workarounds with hardcoded specifiers — no user input reaches them.

### SEC-04: Gitleaks findings
Ran full gitleaks scan. Findings:
- `evals/gitleaks.json` — eval fixture with fake example tokens (covered by `.gitleaksignore`)
- `src/cli/mirror-policy.test.ts` — git tree SHA false-positive (covered by `.gitleaksignore`)
- `eval-results/` — gitignored output directory, not tracked

No real secrets in tracked source code. Existing `.gitleaksignore` correctly suppresses known false positives.

## Verification

- `bun run lint` (tsc --noEmit): PASS
- `bun test src/agents/agent-profiles-persistence.test.ts`: 2/2 pass
- `gitleaks detect --no-git`: 0 findings in tracked src (all in gitignored dirs or suppressed)

## Files Modified

- `src/trpc/routers/agents.ts` — cliPath allowlist validation
- `src/agents/agent-profiles-persistence.test.ts` — set FULCRUM_AGENT_CLI_ALLOWLIST for test paths
- `src/server/trpc/middleware/otel.ts` — safety annotation on dynamic import
