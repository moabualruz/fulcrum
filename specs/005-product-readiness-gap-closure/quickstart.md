# Quickstart: Product Readiness Gap Closure

Run from repository root.

## 1. Select Gap-Closure Spec

```bash
printf '{\n  "feature_directory": "specs/005-product-readiness-gap-closure"\n}\n' > .specify/feature.json
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

## 2. Implement Tasks

Use the spec-kit implementation workflow against `specs/005-product-readiness-gap-closure/tasks.md`.

```bash
pnpm install
pnpm typecheck
pnpm test
```

## 3. Validate Local Readiness

```bash
pnpm --filter @fulcrum/cli dev -- setup apply --json
pnpm --filter @fulcrum/cli dev -- doctor --json --no-network
```

Expected:

- `blockingCount` is `0`
- SQLite canonical state exists and is used
- required runtime and local tools have exact next actions

## 4. Validate Product Surfaces

```bash
pnpm --filter @fulcrum/cli dev -- --help
pnpm --filter @fulcrum/server dev
pnpm --filter @fulcrum/cockpit dev
pnpm --filter @fulcrum/tui dev
pnpm --filter @fulcrum/cli dev -- mcp stdio
```

## 5. Validate Release Evidence

```bash
pnpm --filter @fulcrum/cli dev -- release validate --local-only --evidence /tmp/fulcrum-release-evidence --json
```

Release is ready only when the command passes and the evidence pack has no missing, partial, mock-only, preview-only, or documentation-only source requirements.
