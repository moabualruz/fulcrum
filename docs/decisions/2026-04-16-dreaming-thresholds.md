---
date: 2026-04-16
kind: adr
status: accepted-with-caveat
gate: 3
plan: docs/plans/2026-04-16-memory-v2b-plan.md
finding: product-review F6 (Dreaming thresholds may produce zero promotions without empirical validation)
---

# ADR — Gate 3: Dreaming Promotion Thresholds

## Context

Dreaming light/REM/deep promotion fires at thresholds:
- `minRecallCount = 3`
- `minUniqueQueries = 2`
- `minScore = 0.75`

These come verbatim from source inventory §B.4 (prior art adoption). Adversarial review F3 + product review F6 raised the concern that without an offline sweep on real data, these thresholds may produce zero promotions on Fulcrum's actual access patterns.

The v2b plan's prerequisite Gate 3 calls for running the §12.2 sweep on 249 imported Claude Code / Codex sessions before v2b PR 11 ships Dreaming.

## Decision

**Apply manifest B.4 thresholds verbatim, unvalidated.**

Reason: `~/.local/share/fulcrum/imports/sessions/` does not exist on this machine. There is no imported corpus to sweep against. The §12.2 sweep cannot run; deferring v2b PR 11 indefinitely on a missing corpus is not productive.

Document the lack of validation explicitly:

> The thresholds shipped in v2b PR 11 are NOT empirically calibrated to Fulcrum's real access patterns. Operators MUST observe promotion-rate after first 2 weeks of v2b dogfood data and re-tune via the operator-only `fulcrum dream tune` command (added in v2b PR 11 Task 5.4) if zero or excessive promotions are observed.

## Consequences

- v2b PR 11 ships with default thresholds and a bright-banner log warning at first Dreaming-cycle invocation: `"Dreaming thresholds applied unvalidated. Run 'fulcrum dream stats' after 2 weeks of usage to re-tune."`
- The dogfood operator (the user) is the calibration loop, not an offline sweep.
- If after 2 weeks of v2b deployment promotion-rate is observed at zero, the user re-runs Gate 3 with real data and a new ADR supersedes this one.

## Override path

If imported sessions become available before v2b PR 11 begins (`~/.local/share/fulcrum/imports/sessions/` populated), pre-write a replacement ADR with sweep-derived thresholds. Executor honors the on-disk ADR.
