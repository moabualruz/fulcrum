# Claude Migration Review Report

Status: done
Date: 2026-04-30
Scope: `.scratch/` migration prompt executed by Claude, local branches, scratch workflow files, implementation diffs, and verification gates.

## Verdict

Claude's "fully done" claim is not accurate.

The root project CI passes, and all three feature branches exist on `origin`, but there are release-blocking gaps:

- The compiled `fulcrum` binary cannot run the new product kernel.
- The web app type-check gate fails.
- Local `main` contains the Phase 0/1 and component/parity implementation commits but is still 41 commits ahead of `origin/main`.
- Component-lifecycle and plugin-parity feature branches are mostly changelog-only branches; their implementation lives on local `main`, not on those feature branches.
- The requested per-issue workflow was not followed: issues were closed by pre-existing/bundled commits, not one conventional commit per issue with recorded RED/GREEN/coverage evidence.
- Install/uninstall safety is not acceptable yet: Claude Code plugin paths can invoke `claude plugin install/uninstall` and rewrite/remove Claude plugin settings/cache without a strict Fulcrum ownership marker. This matches the reported symptom that install/uninstall can log the user out of their Claude account.

## Verification Evidence

Fresh checks run from `/Users/mkh/workspace/fulcrum` on branch `feat/product-kernel`:

- `git fetch --prune origin`: completed.
- `git status --short --branch`: clean, `feat/product-kernel...origin/feat/product-kernel`.
- `git branch --all --verbose --no-abbrev`: `main` is `[ahead 41]`; feature branches are pushed.
- `bun run ci`: pass. Stages: install, typecheck, test, build:all, skills:lint, compress:check.
- `cd src/web && bun run build`: pass, with adapter-auto production warning.
- `cd src/web && bun run check`: fail. Missing Bun test/global types in web test files.
- `FULCRUM_HOME=$(mktemp -d)/.fulcrum bun run src/index.ts product init --json`: pass.
- `FULCRUM_HOME=$(mktemp -d)/.fulcrum ./dist/fulcrum-darwin-arm64 product init --json`: fail with `ENOENT: no such file or directory, open '/$bunfs/root/pglite.data'`.
- `bun test --coverage`: test suite passes, but no changed-file coverage threshold/artifact is enforced by the project.
- `semgrep --config auto --json`: 14 findings reported.
- `gitleaks detect --no-banner --redact`: 18 historical findings reported.
- `osv-scanner scan --lockfile bun.lock --format json`: no vulnerabilities.
- `osv-scanner scan --lockfile src/web/bun.lock --format json`: one low-severity advisory, `GHSA-pxg6-pf52-xh8x` for `cookie@0.6.0`.
- `lizard src/product-kernel src/cli/product.ts src/web/src/lib/product-queries.ts src/components src/cli/package-surfaces.ts src/cli/package-mirror.ts src/cli/package-parity.ts`: 4 complexity warnings above CCN 15.
- Targeted install/uninstall review: inspected Claude Code, Codex, Gemini, OpenCode, and Pi install/uninstall paths for broad writes, deletes, and vendor CLI calls.

## Branch And Workflow Findings

### F1 - `main` was not pushed

Severity: high

Evidence:

- Local `main` is `f1fe9c4f9769e2230e84bccbd11cc0fec6944a11`.
- `origin/main` is `ff83ff2138682c8ab8f8a40740d04165f034c9e1`.
- `git branch --all --verbose --no-abbrev` reports `main [ahead 41]`.

Impact:

Phase 0/1 commits and much of the component/parity work are not present on `origin/main`. This violates "every branch is pushed" if `main` is part of the migration baseline.

### F2 - feature branches do not contain their feature implementation equally

Severity: high

Evidence:

- `git log main..feat/component-lifecycle-management` has only `104d2d4 docs(scratch): record component-lifecycle-management changelog`.
- `git log main..feat/plugin-extension-surface-parity` has only `26b0d97 docs(scratch): record plugin-extension-surface-parity changelog`.
- `git log main..feat/product-kernel` contains the product-kernel implementation commits.

Impact:

The requested "one branch per feature off main" shape is not what happened for component-lifecycle and plugin-parity. Their implementation is already on local `main`; their feature branches only add changelogs.

### F3 - one-commit-per-issue and TDD evidence were not preserved

Severity: high

Evidence:

- `.scratch/component-lifecycle-management/issues/01-03` all close via `b858220 feat(component): add lifecycle foundation`.
- `.scratch/product-kernel/issues/01`, `03`, and `04` all close via `bcdc6fc feat(product-kernel): add database, markdown, and state foundations`.
- `.scratch/product-kernel/issues/02-ui-compatibility-spike.md` and `11-web-shell-and-state-bridge.md` have comments but no commit SHA.
- Issue comments record "Verified by ..." but do not include RED/GREEN/refactor command output or coverage figures.
- `bunfig.toml` has `[test] coverage = false`; `bun run ci` does not run coverage.

Impact:

The scratch tracker says `Status: done`, but it does not contain the audit trail the prompt required. Bisect granularity and acceptance evidence are weaker than requested.

### F4 - scratch statuses are internally inconsistent

Severity: medium

Evidence:

- `.scratch/product-kernel/PLAYBOOK.md` and `.scratch/product-kernel/RESEARCH-DESIGN.md` still say `Status: needs-triage`.
- `.scratch/product-kernel/issues/02-ui-compatibility-spike.md` and `11-web-shell-and-state-bridge.md` use `## Assumption` and "when run by a human" wording, but also `Status: done`.
- `.scratch/product-kernel/issues/02-ui-compatibility-spike.md` and `11-web-shell-and-state-bridge.md` do not use the required `Acceptance criteria:` heading.

Impact:

Automated scratch workflow consumers cannot reliably distinguish closed work from human-gated assumptions.

## Code Findings

### C1 - compiled binary cannot run product kernel

Severity: critical

Location:

- `src/product-kernel/db/pglite.ts:1`
- `src/cli/product.ts:26`

Evidence:

`./dist/fulcrum-darwin-arm64 product init --json` fails with:

```text
fulcrum: fatal: ENOENT: no such file or directory, open '/$bunfs/root/pglite.data'
```

Impact:

Fulcrum is distributed as a Bun-compiled binary. The new product kernel works from source but not from the compiled artifact produced by CI. This is a release blocker for product-kernel.

### C2 - web type-check fails

Severity: high

Location:

- `src/web/src/lib/product-queries.test.ts:4`
- `src/web/src/lib/product-queries.test.ts:39`
- `src/web/src/lib/state/fulcrum-store.test.ts:1`
- `src/web/package.json:14`

Evidence:

`cd src/web && bun run check` reports:

```text
Cannot find module 'bun:test' or its corresponding type declarations.
Cannot find name 'Bun'.
```

Impact:

The web app has a failing local type-check gate. Root CI misses this because `tsconfig.json` excludes `src/web/**`.

### C3 - root CI excludes web checks

Severity: high

Location:

- `scripts/ci.ts:9`
- `tsconfig.json:24`

Evidence:

Root CI runs root `tsc`, root `bun test`, `build:all`, skills lint, and compression. `tsconfig.json` excludes `src/web/**`; `src/web` has a separate SvelteKit check/build pipeline.

Impact:

Future web regressions can pass `bun run ci`. This already happened: root CI passed while `src/web` type-check failed.

### C4 - Markdown/frontmatter implementation is not byte-stable for real fixtures

Severity: high

Location:

- `src/product-kernel/markdown.ts:1`
- `src/product-kernel/markdown.ts:14`
- `src/product-kernel/markdown.ts:21`

Evidence:

The implementation parses YAML into an object and serializes it again with `yaml.stringify`. That can drop comments, formatting, and some original scalar styles. The issue failure gate explicitly says to switch to a frontmatter patcher if key order, comments, unknown keys, or body content cannot be preserved on real fixtures.

Impact:

This violates the product-kernel design goal that Markdown/frontmatter remains canonical, diffable, and byte-stable for AI/human editing.

### C5 - shadcn-svelte / adapter-node requirement was not implemented

Severity: medium

Location:

- `src/web/package.json:14`
- `src/web/svelte.config.js:1`
- `.scratch/product-kernel/issues/02-ui-compatibility-spike.md`

Evidence:

The product PRD called for SvelteKit + shadcn-svelte + `@sveltejs/adapter-node` + `lucide-svelte`/`clsx`/`tailwind-merge`. The actual web package uses `@sveltejs/adapter-auto`, Tailwind v4, and no shadcn-svelte dependencies/components.

Impact:

This may be acceptable as an assumption, but it is a deviation from the written acceptance criteria and should be explicitly parked or ratified.

### C6 - product CLI flag parser can treat flag values as the search query

Severity: medium

Location:

- `src/cli/product.ts:122`

Evidence:

`runSearch` computes positionals with `argv.filter((v) => !v.startsWith("--"))`. For `fulcrum product search --org-slug default kernel`, `default` becomes the query.

Impact:

Documented optional flags only work safely after the query. This is a user-facing CLI parsing bug.

### C7 - component status reports ledger state, not actual filesystem state

Severity: medium

Location:

- `src/cli/component.ts:54`
- `src/cli/component.ts:63`
- `src/cli/component.ts:65`

Evidence:

`component status --json` builds surfaces from the SQLite ledger and hard-codes `state: "present"` and `modified: false`.

Impact:

If a managed file is deleted or user-modified after install, status can still report it as present and unmodified. This weakens the component lifecycle promise.

### C8 - package parity audit can over-trust native roots and fallback manifests

Severity: medium

Location:

- `src/cli/package-parity.ts:49`
- `src/cli/package-parity.ts:111`
- `src/cli/package-parity.ts:156`
- `src/cli/package-parity.ts:158`

Evidence:

Native package parity counts a surface as installed when a package root exists. For fallback manifests, `mcpManifestConfigured` returns true when `target.surface.sourcePath` is not a real file.

Impact:

Parity can say OK while individual native plugin surfaces or package MCP config are incomplete. This is exactly the class of drift the parity feature was meant to catch.

### C9 - doctor records product DB errors but does not change verdict

Severity: medium

Location:

- `src/cli/doctor.ts:579`
- `src/cli/doctor.ts:794`
- `src/cli/doctor.ts:801`

Evidence:

`buildProductKernelReport()` catches product DB errors and stores `error`, but the parent warning/error counters are not incremented.

Impact:

`fulcrum doctor` can report `verdict: ok` or `warning` unrelated to product DB corruption/failure.

### C10 - complexity warnings in new lifecycle/parity code

Severity: low

Evidence from `lizard`:

- `src/components/adapters/vendor.ts:85` `installVendor` CCN 18.
- `src/components/executor.ts:54` lizard-reported block CCN 19.
- `src/cli/package-surfaces.ts:280` `classifySurface` CCN 41.
- `src/cli/package-mirror.ts:24` `planPackageMirrorTargets` CCN 59.

Impact:

Not a correctness failure by itself, but these are the files most likely to accumulate package-specific drift.

## Agent Install/Uninstall Safety Findings

### A1 - Claude plugin uninstall is not consistently ownership-gated

Severity: critical

Location:

- `src/cli/uninstall.ts:242`
- `src/cli/uninstall.ts:250`
- `src/cli/uninstall.ts:257`
- `src/cli/upstream-skills.ts:835`
- `src/cli/upstream-skills.ts:854`

Evidence:

`removeSkillNamespaces()` runs `claude plugin uninstall fulcrum@fulcrum` and then uninstalls upstream lockfile Claude plugins when Claude exists. `removeUpstreamSkills()` also uninstalls Claude plugins for matching lockfile entries. The upstream Claude plugin install path does not write a Fulcrum ownership marker before uninstall later decides to remove it.

Impact:

Fulcrum can remove a Claude plugin that the user installed outside Fulcrum, and every uninstall can invoke Claude's own CLI account/plugin machinery. This is the most likely path behind "install/uninstall logs me out of Claude."

Required fix:

Never run `claude plugin uninstall ...` unless Fulcrum has a per-plugin marker proving Fulcrum installed that exact plugin. No marker means print a manual command and leave Claude state untouched.

### A2 - Claude settings cleanup deletes broad plugin keys without value provenance

Severity: high

Location:

- `src/cli/uninstall.ts:562`
- `src/cli/uninstall.ts:568`
- `src/cli/uninstall.ts:581`
- `src/cli/uninstall.ts:606`

Evidence:

`cleanupClaudeManagedPluginSettings()` rewrites `~/.claude/settings.json`, deleting entries from `extraKnownMarketplaces` and `enabledPlugins` by hard-coded key names. It does not verify that Fulcrum wrote those values, and it deletes parent containers when empty.

Impact:

If Claude stores plugin/account state or adjacent auth UX state in the same settings file, purge can mutate it. Even when values are plugin-related, this is still broad file rewrite behavior rather than targeted edit with provenance.

Required fix:

Patch only exact Fulcrum-owned values recorded in marker metadata. Do not delete parent containers unless a Fulcrum-created-file marker proves the whole file/container was created by Fulcrum.

### A3 - Claude cache and marketplace removals are too broad

Severity: high

Location:

- `src/cli/uninstall.ts:461`
- `src/cli/uninstall.ts:610`
- `src/cli/uninstall.ts:623`
- `src/cli/repomix-package.ts:248`
- `src/cli/vendor-packages.ts:749`

Evidence:

Purge/cleanup removes broad roots such as `~/.claude/plugins/cache/repomix`, `~/.claude/plugins/marketplaces/repomix`, `~/.claude/plugins/cache/cloudflare`, and `~/.claude/plugins/cache/claude-plugins-official/superpowers`.

Impact:

Those paths can contain user-installed vendor plugin state, not only Fulcrum-created files. Removing whole roots can force Claude to rehydrate plugin/account state on next startup.

Required fix:

Remove only exact files/directories Fulcrum created, keyed by marker metadata. Prefer versioned plugin directories over marketplace/cache roots. If ownership is ambiguous, leave it and report manual cleanup.

### A4 - install invokes Claude CLI plugin commands automatically

Severity: high

Location:

- `src/cli/install.ts:594`
- `src/cli/install.ts:598`
- `src/cli/skills.ts:221`
- `src/cli/skills.ts:229`
- `src/cli/vendor-packages.ts:720`
- `src/cli/vendor-packages.ts:722`
- `src/cli/repomix-package.ts:193`
- `src/cli/repomix-package.ts:200`
- `src/cli/upstream-skills.ts:713`
- `src/cli/upstream-skills.ts:729`

Evidence:

Install paths call `claude plugin marketplace add` and `claude plugin install` for Fulcrum, Caveman, Repomix, Cloudflare, Superpowers, and upstream lockfile plugins.

Impact:

Repeated install runs repeatedly enter Claude's plugin CLI state machine. If Claude's CLI refreshes auth/session state during plugin operations, Fulcrum can cause account logout even when no source file is overwritten.

Required fix:

Default install should avoid Claude CLI mutation. For already-installed plugins, refresh only Fulcrum-owned cache payloads. For first install, require an explicit opt-in flag or print manual Claude commands. When a Claude CLI call succeeds, write a per-plugin ownership marker with plugin name, marketplace, operation, and timestamp.

### A5 - JSON/TOML config writes are whole-file rewrites across agents

Severity: medium

Location:

- `src/cli/mcp-registry.ts:330`
- `src/cli/mcp-registry.ts:558`
- `src/cli/mcp-registry.ts:586`
- `src/cli/mcp-registry.ts:608`
- `src/cli/uninstall.ts:105`
- `src/cli/uninstall.ts:510`
- `src/cli/vendor-packages.ts:770`

Evidence:

Gemini `settings.json`, OpenCode `opencode.json`, Pi `settings.json`/`mcp.json`, and Codex hook/config files are modified by parsing and serializing the full file. Cleanup can also remove an entire file when the resulting JSON object is empty.

Impact:

Unknown user keys are mostly preserved, but formatting and comments are not, and whole-file replacement violates the targeted-edit rule. For account-adjacent files this increases blast radius.

Required fix:

Use agent-specific patchers that only add/remove one key or one sentinel/TOML block. Keep backups in `~/.fulcrum/state/global/backups`. Never delete an agent config file unless a Fulcrum marker proves Fulcrum created that file.

### A6 - some vendor mirrors still overwrite top-level skill/command names

Severity: medium

Location:

- `src/cli/repomix-package.ts:442`
- `src/cli/repomix-package.ts:447`
- `src/cli/repomix-package.ts:706`
- `src/cli/upstream-skills.ts:772`
- `src/cli/upstream-skills.ts:895`

Evidence:

Repomix installs/removes top-level names such as `pack-local`, `pack-remote`, and `explorer` under agent skill/command roots. Upstream skills also copy into vendor top-level names and rely on post-copy markers.

Impact:

If the user already has a skill/command with the same name, install can overwrite it and uninstall can later remove it. This is not safe for all CLI agents.

Required fix:

Before writing any top-level agent skill/command path, check for an existing path without a Fulcrum marker. If present, back up and skip with a conflict report, or use a namespaced path where the agent supports it. Mark ownership before or atomically with first write.

### A7 - cross-agent safety matrix

Severity: medium

| Agent | Risk observed | Required policy |
|---|---|---|
| Claude Code | Plugin CLI install/uninstall, broad settings/cache cleanup | No Claude CLI mutation unless explicit opt-in or ownership marker; targeted settings patches only |
| Codex CLI | `config.toml`/`hooks.json` rewrites, plugin cache mirror removals | Sentinel/TOML block patches only; no whole-file removal unless Fulcrum-created |
| Gemini CLI | `settings.json`, `mcp-server-enablement.json`, extension dirs | Patch only `mcpServers.<name>` / enablement key; preserve settings file and user extensions |
| OpenCode | `opencode.json`, plugin array, commands/agents/rules mirrors | Patch only owned array value/key/block; marker-gate top-level command removal |
| Pi CLI | `settings.json` packages, `mcp.json`, prompts/skills/package mirrors | Patch only owned package/server entries; marker-gate prompt/skill removals |

## Security And Dependency Findings

### S1 - Semgrep reports 14 findings

Severity: medium

Summary:

- One likely fixture/test secret finding: `evals/gitleaks.json:3`.
- Bash `IFS` warnings in eval harnesses.
- Non-literal regexp warnings in install/uninstall/MCP/Repomix hook-cleanup code.

Impact:

No direct product-kernel exploit was confirmed, but the run is not "clean" under the requested security scan.

### S2 - Gitleaks reports existing historical/local leaks

Severity: medium

Evidence:

- `gitleaks detect --no-banner --redact` reports 18 leaks across git history.
- `gitleaks detect --no-git --redact` also reports ignored `.claude/worktrees` and `eval-results` leaks.

Impact:

Most look historical or fixture-like, but release hygiene is not clean. The ignored `.claude/worktrees` matches doctor warnings about project-local ignored worktrees.

### S3 - web lockfile has one low advisory

Severity: low

Evidence:

- `src/web/bun.lock` includes `cookie@0.6.0`, affected by `GHSA-pxg6-pf52-xh8x`.

Impact:

Low severity and likely transitive through SvelteKit, but it should be tracked before web surfaces become user-facing.

## Alignment Matrix

| Prompt requirement | Observed state | Result |
|---|---|---|
| Phase 0 context docs committed | `CONTEXT-MAP.md`, per-context `CONTEXT.md`, ADR templates exist on local `main` | Partial: local `main` not pushed |
| Phase 1 issue split | 39 issues exist under `.scratch/*/issues` | Partial: schema mostly present, statuses inconsistent |
| One branch per feature | 3 feature branches exist and are pushed | Partial: two branches are changelog-only |
| One commit per issue | Multiple issues share commits; some issue comments lack commit SHA | Fail |
| Strict TDD evidence | No RED/GREEN evidence preserved in issues/commits | Fail |
| Coverage >=80% changed files | No coverage threshold in CI; `bunfig.toml` coverage false | Fail |
| Final CI on each branch | Root CI passes on current branch; not verified on all branches in this review | Partial |
| Per-feature changelog | Each branch has its feature changelog | Pass |
| Branches pushed | Feature branches pushed | Partial: local `main` ahead 41 |
| Web SvelteKit/shadcn | SvelteKit/Tailwind scaffold exists | Partial: shadcn-svelte/adapter-node missing; web check fails |
| Product kernel in compiled CLI | Source command works | Fail: compiled binary fails |
| Install/uninstall account safety | Broad Claude plugin CLI calls and cache/settings cleanup remain | Fail |
| Targeted edits only | Several agent config paths still rewrite/delete whole files or top-level roots | Fail |

## Recommended Follow-up Issues

Create these under `.scratch/product-kernel/issues/` or a new remediation feature before merging product-kernel:

1. `13-compiled-binary-pglite-compat.md` - make product DB work in compiled Bun binaries or gate PGlite behind a source/dev-only fallback.
2. `14-web-ci-and-typecheck.md` - add Bun types or exclude web tests from Svelte check correctly; wire `src/web` check/build into root CI.
3. `15-frontmatter-byte-stability.md` - replace YAML parse/stringify with a frontmatter patcher and real fixtures containing comments/order/unknown keys.
4. `16-product-cli-flag-parser.md` - replace ad hoc product CLI parsing with a tested parser that supports flags before/after positionals.
5. `17-component-status-filesystem-audit.md` - make `component status` inspect actual managed files and modified state, not ledger-only state.
6. `18-package-parity-native-surface-audit.md` - verify native package surfaces and package MCP config by actual files/config, not root existence.
7. `19-doctor-product-kernel-verdict.md` - make product-kernel DB errors increment doctor warnings/errors.
8. `20-scratch-workflow-repair.md` - normalize issue headings, statuses, commit SHAs, and RED/GREEN/coverage evidence where recoverable.
9. `21-agent-install-uninstall-safety.md` - stop automatic Claude CLI plugin mutation unless explicitly opted in or marker-owned; add per-plugin ownership markers.
10. `22-targeted-agent-config-patchers.md` - replace whole-file JSON/TOML rewrites/removals with targeted patchers for Claude, Codex, Gemini, OpenCode, and Pi.
11. `23-agent-cache-and-skill-ownership.md` - marker-gate every top-level skill/command/cache removal and skip or back up unowned conflicts before writing.
