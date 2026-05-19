# Agent Catalog Profiles

> Per-agent runtime profiles: one module per supported CLI, each exporting a Zod-validated `AgentProfile` literal consumed by the parent registry.

## Language

**AgentProfile**:
Runtime configuration record for one CLI agent (cliPath, defaultFlags, skillFolder, authEnvVars, sandcastle, limits).
_Avoid_: AgentConfig, AgentDefinition, AgentEntry.

**cliPath**:
The executable name or absolute path used to invoke the agent.
_Avoid_: binary, command.

**defaultFlags**:
Argv tokens always prepended to an agent invocation.
_Avoid_: args, switches.

**skillFolder**:
Tilde-prefixed path where the agent loads skills at session start.
_Avoid_: skillsDir, skillRoot.

**authEnvVars**:
Environment variable names the agent reads for credentials.
_Avoid_: secrets, tokens.

**sandcastleProvider**:
Sandbox backend used when isolating a run (`noSandbox`, `docker`, `podman`, `vercel`, `daytona`, `modal`, `e2b`).
_Avoid_: sandbox, runtime.

**tokenCountPattern**:
Optional regex extracting input/output token totals from the agent's stdout.
_Avoid_: usageRegex.

**supportsSessionResume**:
Optional flag marking agents whose CLI can resume a prior session id.
_Avoid_: resumable.

## Relationships

- Each profile module exports exactly one **AgentProfile** literal
- The parent **registry** imports every profile and exposes them as a keyed map
- Every **AgentProfile** is parsed against `AgentProfileSchema` from `../types.ts`
- A profile's `name` matches the parent catalog's **AgentId** value

## Example dialogue

> **Dev:** "Where do I change Claude Code's `defaultFlags`?"
> **Domain expert:** "Edit `claude-code.ts` — that profile owns the literal. Don't touch the registry; it just re-exports."
> **Dev:** "And if a new agent ships with its own sandbox?"
> **Domain expert:** "Add a new value to `SandcastleProviderSchema`, then a new profile module here."

## Flagged ambiguities

- `skillFolder` here vs parent `skillsDir` on the canonical `Agent` interface — kept as `skillFolder` inside profiles to match the Zod schema; do not rename without migrating both.
- `name` field duplicates `AgentId` semantics — resolved: profile `name` is the wire string, `AgentId` is the typed union; they must stay aligned.
