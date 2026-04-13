# Contributing to Fulcrum

Thank you for taking the time to contribute. All contributions are welcome — bug reports, feature requests, documentation improvements, and code.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Commit Message Style](#commit-message-style)

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

---

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- Fulcrum version (`@fulcrum/core` version from `package.json`)
- Node.js version (`node --version`)
- OS and SQLite version if relevant
- Minimal reproduction steps

---

## Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Describe the use case first — what problem does this solve? — before the proposed solution.

---

## Development Setup

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
git clone https://github.com/moabualruz/fulcrum.git
cd fulcrum
pnpm install
```

The repo is a pnpm workspace. The main package is `packages/core`.

```bash
cd packages/core
pnpm test          # run the full test suite
pnpm test:watch    # watch mode during development
```

**TypeScript check:**

```bash
npx tsc --noEmit
```

---

## Running Tests

Tests use Vitest with `pool: 'forks'` (required because `better-sqlite3` is not thread-safe). Each test file gets a fresh in-memory SQLite instance via `createTestDb()` / `resetTestDb()`.

```bash
cd packages/core
pnpm test
```

To run embedding integration tests (downloads ~500 MB of ONNX models on first run):

```bash
FULCRUM_EMBEDDING_TESTS=1 pnpm test
```

---

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes with tests
3. Ensure `pnpm test` and `npx tsc --noEmit` both pass
4. Open a PR — the template will guide you through what to include

**Keep PRs focused.** One logical change per PR is easier to review and easier to revert if needed.

---

## Commit Message Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(scope): short description

Optional longer body explaining why, not what.
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`  
Scope examples: `core`, `policy`, `memory`, `janitor`, `db`

Examples:
```
feat(core): add heartbeat timeout validation
fix(memory): catch all SQLITE_ERROR in FTS5 fallback
docs: update README with embedding configuration
test(policy): add cross-workspace isolation test
```
