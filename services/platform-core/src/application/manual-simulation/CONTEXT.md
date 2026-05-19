# Manual Simulation

A harness for scripting end-to-end manual verification of Fulcrum surfaces (CLI, TUI, public API) inside a disposable workspace, capturing evidence artifacts for review.

## Language

**ManualSimulationWorkspace**:
A disposable temp directory with `home`, `evidence/logs`, and `evidence/snapshots` subdirs that scopes one simulation run.
_Avoid_: sandbox, scratch dir, temp home

**FakeApiServer**:
An in-process Bun HTTP server that records every request and serves scripted JSON responses to the CLI under test.
_Avoid_: mock server, stub backend, test double

**CliSimulationResult**:
The captured `argv`, `stdout`, `stderr`, `exitCode`, and persisted `evidencePath` of one spawned `bun apps/cli/src/main.ts` invocation.
_Avoid_: cli output, run record, command result

**ScriptedTerminal**:
A driver that injects keys into a mounted TUI target and exposes the rendered `plainText()` for snapshotting.
_Avoid_: terminal emulator, input driver, pty

**TuiSimulationResult**:
A labeled sequence of post-keystroke terminal snapshots written to `evidence/snapshots/<label>.json`.
_Avoid_: tui trace, render log, key replay

**RealTerminalSmokeCase**:
A named CLI argv plus `expectedText` markers and `evidenceKind` (`terminal-log | screenshot`) executed against a real PTY for launcher-level smoke coverage.
_Avoid_: smoke test, sanity check, boot test

**CrossSurfaceJourney**:
A `projectId`+`traceId`-scoped ordered list of `CrossSurfaceJourneyStep`s that exercises CLI, TUI, and public-api surfaces against the same persisted state.
_Avoid_: scenario, e2e flow, user story

**CrossSurfaceJourneyStep**:
One step in a journey naming its `surface`, optional `cliCommand` or `tuiKeys`, `expectedPersistedState` tokens, and `evidenceArtifacts` paths.
_Avoid_: action, step record, transition

**ManualSimulationEvidence**:
The `fulcrum.manual-simulation.v1` JSON document written to `evidence/manual-simulation.json` aggregating CLI, TUI, real-terminal, journey, and artifact references for one workspace.
_Avoid_: report, run log, transcript

## Relationships

- A **ManualSimulationWorkspace** owns one **ManualSimulationEvidence** document and zero-or-one **FakeApiServer**.
- A **CliSimulationResult** is produced per `runCliSimulation` call against the workspace's `homeDir` and optional **FakeApiServer**.
- A **TuiSimulationResult** is produced per `runTuiSimulation` call driving a `TerminalScriptTarget` via a **ScriptedTerminal**.
- A **CrossSurfaceJourney** has many ordered **CrossSurfaceJourneyStep**s sharing one `projectId` and `traceId`.
- A **ManualSimulationEvidence** aggregates the workspace's **CliSimulationResult**s, **TuiSimulationResult**s, **RealTerminalSmokeCase**s, and **CrossSurfaceJourney**s.

## Example dialogue

> **Dev:** "If the CLI step in a **CrossSurfaceJourney** writes a project row, where does the proof live?"
> **Domain expert:** "The spawned process writes a **CliSimulationResult** to `evidence/logs/`, and the step's `evidenceArtifacts` path points to it. The aggregated **ManualSimulationEvidence** references both."
> **Dev:** "And the launcher boot check?"
> **Domain expert:** "That's a **RealTerminalSmokeCase**, not a **TuiSimulationResult** — smoke cases run against a real PTY with `expectedText` markers; TUI results come from a **ScriptedTerminal** snapshot loop."

## Flagged ambiguities

- "terminal" overlapped **ScriptedTerminal** (in-process driver for `runTuiSimulation`) and the real PTY used by a **RealTerminalSmokeCase** — resolved: scripted is for snapshot loops, real-terminal is for launcher smoke only.
- "evidence" overlapped per-step `evidenceArtifacts` paths and the aggregated **ManualSimulationEvidence** document — resolved: artifacts are file paths produced by individual simulations; the evidence document is the single `manual-simulation.json` that references them.
