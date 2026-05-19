# Init

First-run bootstrap for the local Fulcrum database: runs migrations, seeds the default **Org** and admin **User**, and gates destructive recovery behind explicit confirmation.

## Language

**InitStatus**:
The outcome of `initializeLocalDatabase` indicating whether this run created the first **Org** (`bootstrapped`) or found one already present (`already-initialized`).
_Avoid_: init result, bootstrap state, setup status

**LocalReadinessStatus**:
The classification of the local **FULCRUM_HOME** state — `pass`, `repairable`, or `reset-required`.
_Avoid_: health, doctor verdict, init check

**LocalStateResetPlan**:
A proposed reset of **FULCRUM_HOME** that only executes when the caller passes `--yes-reset-local-state`.
_Avoid_: reset, wipe, nuke, recovery action

**InteractiveRequiredError**:
The exit-code-7 refusal raised when `runInteractiveInit` is asked to create the first **Org** under `nonInteractive`.
_Avoid_: confirmation error, prompt error, headless failure

## Relationships

- `initializeLocalDatabase` runs **MigratorService** then **SeedService**; its **InitStatus** is decided by `hasAnyOrg` checked before the seed.
- `runInteractiveInit` calls `seedOrgAndAdmin` unless no default **Org** exists and `nonInteractive` is set, in which case it throws **InteractiveRequiredError**.
- A **LocalStateResetPlan** is produced for **FULCRUM_HOME** and is executable only when `confirm` is true (the `--yes-reset-local-state` flag).

## Example dialogue

> **Dev:** "If `fulcrum init` runs twice, what's the **InitStatus** the second time?"
> **Domain expert:** "`already-initialized` — `hasAnyOrg` returned true before the seed, but the **SeedService** still runs idempotently."
> **Dev:** "And if **FULCRUM_HOME** is `reset-required` but no flag was passed?"
> **Domain expert:** "You get a **LocalStateResetPlan** with `canExecute: false`; the CLI refuses until `--yes-reset-local-state` is supplied."

## Flagged ambiguities

- "init" overlapped database migration, org seeding, and local-state reset — resolved: `initializeLocalDatabase` is the migrate+seed entry point; **LocalStateResetPlan** is a separate destructive recovery path keyed on **FULCRUM_HOME**.
- "bootstrap" was used for both the first-org **InitStatus** and the parent service's **LocalBootstrapSeed** — resolved: **InitStatus** `bootstrapped` is the per-run signal; **LocalBootstrapSeed** is the parent-service seed entity.
