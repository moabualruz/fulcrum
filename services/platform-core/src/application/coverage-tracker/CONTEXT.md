# Coverage Tracker

Builds and merges the command/control coverage artifact that maps every CLI command and TUI keybinding to the test or manual evidence that proves it works.

## Language

**CommandControlSurface**:
The invocation surface for a tracked action, either `cli` or `tui`.
_Avoid_: frontend, channel, ui mode

**SourceInventoryItem**:
A parsed CLI command or TUI key entry harvested from source files, carrying `id`, `surface`, `action`, `sourcePath`, and optional `flags`/`outputModes`/`keybindings`.
_Avoid_: command spec, action descriptor, route

**ManualCoverageAnnotation**:
A human-authored attachment to a `SourceInventoryItem` `id` supplying `testPath`, `manualSimulation`, `evidencePaths`, `status`, and `notes`.
_Avoid_: test mapping, qa note, override

**CommandControlCoverageRow**:
The merged row joining one `SourceInventoryItem` with its `ManualCoverageAnnotation`, exposing `passes` and `CoverageStatus`.
_Avoid_: coverage entry, test row, result

**CoverageStatus**:
The annotation verdict for a row: `unproven`, `pass`, or `fail`.
_Avoid_: state, outcome, grade

**CommandControlCoverageArtifact**:
The serialized `fulcrum.command-control-coverage.v1` document containing `generatedFrom` source paths and the sorted `rows`.
_Avoid_: report, manifest, coverage file

## Relationships

- A **SourceInventoryItem** is matched to at most one **ManualCoverageAnnotation** by `id` to form one **CommandControlCoverageRow**.
- A **CommandControlCoverageRow** has `passes = true` only when its `CoverageStatus` is `pass` and `evidencePaths` is non-empty.
- A **CommandControlCoverageArtifact** holds many **CommandControlCoverageRows** sorted by `surface` then `id`.
- Regeneration via `mergeCoverageAnnotations` keeps prior **ManualCoverageAnnotation** fields keyed by row `id` while replacing inventory-sourced fields.

## Example dialogue

> **Dev:** "If a TUI key shows up in source but has no **ManualCoverageAnnotation**, what's its **CoverageStatus**?"
> **Domain expert:** "`unproven`, and `passes` is false. It only flips to `passes: true` when the annotation sets `status: pass` and supplies at least one `evidencePaths` entry."
> **Dev:** "And re-running the parsers won't wipe my notes?"
> **Domain expert:** "Right — `mergeCoverageAnnotations` replays existing rows as annotations against the regenerated inventory, so `testPath`, `manualSimulation`, `evidencePaths`, and `notes` survive."

## Flagged ambiguities

- "coverage" overlapped test-runner line coverage and this artifact's manual evidence map — resolved: a **CommandControlCoverageRow** records command/control proof, not statement coverage.
- "status" vs "passes" — resolved: **CoverageStatus** is the annotated verdict; `passes` is the derived boolean that also requires `evidencePaths`.
