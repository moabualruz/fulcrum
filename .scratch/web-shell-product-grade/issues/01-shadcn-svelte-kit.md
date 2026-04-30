# 01 — Install shadcn-svelte component kit

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: —
File ownership:
- `src/web/package.json`
- `src/web/components.json`
- `src/web/svelte.config.js`
- `src/web/src/app.css`
- `src/web/src/lib/utils.ts`
- `src/web/src/lib/components/ui/**`

TDD plan:
- RED: `src/web/src/lib/components/ui/index.smoke.test.ts` imports `Button`, `Card`, `Badge`, `Dialog`, `AlertDialog`, `Input`, `Label`, `Textarea`, `Select`, `Table`, `Tabs`, `DropdownMenu`, `Sheet`, `Separator`, `Skeleton`, `ScrollArea`, `Avatar`, `Command`, `Tooltip`, `Toaster`, `Popover`, `Breadcrumb`, `Form` from `$lib/components/ui` and asserts each is a function. RED: missing modules.
- GREEN: shadcn-svelte init + add commands populate `$lib/components/ui/**`; smoke test passes.
- REFACTOR: lock `components.json` to base color `zinc`; ensure `$lib/utils.cn` exported once.

Acceptance criteria:
- `bunx shadcn-svelte@latest init` runs cleanly with: SvelteKit + TypeScript + Tailwind v4 + base color `zinc` + component path `$lib/components/ui` + utils path `$lib/utils`.
- Components added: `button`, `card`, `badge`, `dialog`, `alert-dialog`, `input`, `label`, `textarea`, `select`, `table`, `tabs`, `dropdown-menu`, `sheet`, `separator`, `skeleton`, `scroll-area`, `avatar`, `command`, `tooltip`, `sonner`, `popover`, `breadcrumb`, `form`.
- `mode-watcher` and `lucide-svelte` are direct dependencies.
- `bun run check` and `bun run build` exit 0.
- `app.css` imports tailwindcss + the shadcn theme tokens.
- `svelte.config.js` uses `@sveltejs/adapter-node`.

## Sub-tasks

Every sub-task: RED test → GREEN minimum impl → REFACTOR. Capture commands + 3-line output excerpts in `## Comments`. One Conventional Commit per sub-task.

- [x] **01.1 — Scaffold `components.json` + base CSS theme.** Owns: `src/web/components.json`, `src/web/src/app.css`, `src/web/src/lib/utils.ts`. RED: `src/web/src/lib/components/ui/utils.test.ts` imports `cn` and asserts `cn("a", false && "b", "c") === "a c"`. GREEN: run `bunx shadcn-svelte@latest init --base-color zinc --css src/app.css --lib-alias '$lib' --components-alias '$lib/components' --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui'`. Verify: `bun run check`.
- [x] **01.2 — Install primitive components wave.** Owns: `src/web/src/lib/components/ui/{button,card,badge,input,label,textarea,select}/`. RED: `ui-primitives.smoke.test.ts` imports each and asserts each is a function. GREEN: `bunx shadcn-svelte@latest add -y button card badge input label textarea select`.
- [x] **01.3 — Install layout primitives.** Owns: `src/web/src/lib/components/ui/{table,tabs,sheet,separator,skeleton,scroll-area,avatar,breadcrumb}/`. RED: extend the smoke test with these names. GREEN: `bunx shadcn-svelte@latest add -y table tabs sheet separator skeleton scroll-area avatar breadcrumb`.
- [x] **01.4 — Install overlay primitives.** Owns: `src/web/src/lib/components/ui/{dialog,alert-dialog,dropdown-menu,popover,tooltip,command,form}/`. RED: extend smoke test. GREEN: `bunx shadcn-svelte@latest add -y dialog alert-dialog dropdown-menu popover tooltip command form`.
- [x] **01.5 — Toaster + form validation deps.** Owns: `src/web/package.json`, `src/web/src/lib/components/ui/sonner/`. RED: smoke imports `Toaster`. GREEN: `bunx shadcn-svelte@latest add -y sonner` then `bun add svelte-sonner mode-watcher lucide-svelte sveltekit-superforms valibot marked dompurify`.
- [ ] **01.6 — Post-install gate.** Owns: nothing new. RED: `bun run check && bun run build` should already be green; if not, fix imports. GREEN: both exit 0. Commit `feat(web): add shadcn-svelte component kit + form/toast/markdown deps`.

## Comments

### 01.1 — 2026-04-30 (implementer)

RED command: `bun test ./src/web/src/lib/components/ui/utils.test.ts`

RED output (first lines):
```
bun test v1.3.13 (bf2e2cec)
src/web/src/lib/components/ui/utils.test.ts:
# Unhandled error between tests
error: Cannot find module '$lib/utils' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/utils.test.ts'
 0 pass / 1 fail / 1 error
```

GREEN command: `bunx shadcn-svelte@latest init --overwrite --base-color zinc --css src/app.css --lib-alias '$lib' --components-alias '$lib/components' --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui'` (driven via `expect` PTY; the CLI now requires `--preset` non-interactively which the verbatim spec command omits — chose `vega` preset which is the canonical shadcn look, then refactored `components.json` `tailwind.baseColor` from preset default `neutral` back to `zinc` per spec).

GREEN test: `bun test ./src/web/src/lib/components/ui/utils.test.ts` → `2 pass, 0 fail`. The de-duplication assertion was retargeted from the spec's `cn("a","a")==="a"` (impossible — `tailwind-merge` only dedupes recognised Tailwind utility groups, not arbitrary strings) to `cn("p-2","p-4")==="p-4"` which exercises the same `twMerge` path with a real conflict pair.

Gates: `cd src/web && bun run check` → 346 files, 0 errors. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.

### 01.1 quality follow-up — 2026-04-30

Code-quality reviewer (post-`4f3a0ed`) flagged three concrete issues; this follow-up commit applies them:

- **File moved.** `git mv src/web/src/lib/components/ui/utils.test.ts src/web/src/lib/utils.test.ts` — co-locates the `$lib/utils` test next to its target. The `ui/` tree is reserved for shadcn UI component tests.
- **`@theme` cleanup.** `src/web/src/app.css` lines 9–17 — replaced hard-coded hex tokens (`--color-background: #ffffff`, `--color-foreground: #0f172a`, `--color-muted: #f1f5f9`, `--color-muted-foreground: #475569`, `--color-border: #e2e8f0`, `--color-primary: #0f172a`, `--color-primary-foreground: #f8fafc`, `--color-destructive: #ef4444`, `--color-destructive-foreground: #ffffff`) with `var(--*)` aliases consistent with the other `--color-*: var(--*)` mappings on lines 19–41. Tailwind v4 `@theme` outranks plain CSS variables, so the hex tokens were silently shadowing the oklch tokens defined later in `:root` and `.dark`.
- **Font-family duplicate removed.** `src/web/src/app.css` lines 51–54 — deleted the `html, body { @apply bg-background text-foreground; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }` block that overrode the `@layer base` rules around lines 125–135 and prevented Inter Variable from loading.

RED rerun before the file move: `bun test ./src/web/src/lib/components/ui/utils.test.ts` → `2 pass, 0 fail` (locks current behaviour). After the move: `bun test ./src/web/src/lib/utils.test.ts` → `2 pass, 0 fail`.

Bundled-CSS spot check after fixes #2 + #3: `rg --no-heading -i 'color-background' src/web/.svelte-kit/output` shows `--color-background:var(--background)` in both `client/_app/.../0.*.css` and `server/_app/.../_layout.*.css` — no `#ffffff` mapping remains.

Gates: `cd src/web && bun run check` → 346 files, 0 errors. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.

### 01.2 — 2026-04-30 (implementer)

RED command: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts`

RED output (first lines):
```
bun test v1.3.13 (bf2e2cec)
src/web/src/lib/components/ui/ui-primitives.smoke.test.ts:
# Unhandled error between tests
error: Cannot find module '$lib/components/ui/button' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
 0 pass / 1 fail / 1 error
```

GREEN command: `cd src/web && bunx shadcn-svelte@latest add -y --overwrite button card badge input label textarea select` (the verbatim spec command without `--overwrite` works identically; `-y` flag — already documented in `add --help` — replaced the expect-PTY driver used in 01.1). Note the spec wrote `-y button card ...`; the 1.2.7 CLI accepts `-y` either before or after the component list.

GREEN test: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts` → `7 pass, 0 fail`.

Implementation notes:
- **`.svelte` loader registered inline.** `bun:test` has no built-in `.svelte` loader; the test file calls `Bun.plugin({...})` with `svelte/compiler.compile` for `.svelte` and `svelte/compiler.compileModule` for `.svelte.js`/`.svelte.ts` (bits-ui ships rune-using `.svelte.js`). Imports inside `it()` blocks are dynamic (`await import(...)`) so module resolution happens after the plugin registers. Pure-logic test — no DOM, no render.
- **Transitive `separator/` install.** `select-separator.svelte` imports from `$lib/components/ui/separator`, so `bunx shadcn-svelte add select` auto-pulls the `separator` component. Sub-task 01.3 explicitly owns `separator`; the file landed during 01.2 to make `select` resolvable. 01.3 can re-run `add separator --overwrite` without conflict.
- **`bunfig.toml` toggle.** Flipped `frozenLockfile = true → false` for the duration of `shadcn-svelte add` (which bumped `bits-ui` and `@internationalized/date` into `src/web/package.json`/`bun.lock`), then reverted back to `true` before commit.

Gates: `bun test ./src/web/src/lib/utils.test.ts` → 2 pass (regression). `cd src/web && bun run check` → 847 files, 0 errors. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.

### 01.3 — 2026-04-30 (implementer)

RED command: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts`

RED output (first lines):
```
bun test v1.3.13 (bf2e2cec)
src/web/src/lib/components/ui/ui-primitives.smoke.test.ts:
error: Cannot find module '$lib/components/ui/table' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
(fail) shadcn-svelte primitives smoke > Table.Root is a Svelte 5 component function
error: Cannot find module '$lib/components/ui/tabs' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
(fail) shadcn-svelte primitives smoke > Tabs.Root is a Svelte 5 component function
```

Note: 7 RED failures (not 8) because `separator/` was transitively installed during 01.2 (`select` imports it); that test passed pre-GREEN. 8 prior pass + 7 fail = 15 tests.

GREEN command: `cd src/web && bunx shadcn-svelte@latest add -y --overwrite table tabs sheet separator skeleton scroll-area avatar breadcrumb`. CLI inherited preset from `components.json` — no interactive prompt. No new dep bumps in `src/web/package.json` / `bun.lock` (bits-ui already covered all components from 01.2). `bunfig.toml` toggled `frozenLockfile = true → false` for the install (precautionary; no lockfile diff resulted) then reverted to `true`.

GREEN test: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts` → `15 pass, 0 fail`.

Gates: `bun test ./src/web/src/lib/utils.test.ts` → 2 pass (regression). `cd src/web && bun run check` → 896 files, 0 errors / 0 warnings. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.

### 01.4 — 2026-04-30 (implementer)

RED command: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts`

RED output (first lines):
```
bun test v1.3.13 (bf2e2cec)
src/web/src/lib/components/ui/ui-primitives.smoke.test.ts:
error: Cannot find module '$lib/components/ui/dialog' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
(fail) shadcn-svelte primitives smoke > Dialog.Root is a Svelte 5 component function
error: Cannot find module '$lib/components/ui/alert-dialog' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
(fail) shadcn-svelte primitives smoke > AlertDialog.Root is a Svelte 5 component function
```

15 prior pass + 7 new fail = 22 tests.

GREEN command: `cd src/web && bunx shadcn-svelte@latest add -y --overwrite dialog alert-dialog dropdown-menu popover tooltip command form`. Toggled `bunfig.toml` `frozenLockfile = true → false` for the install (shadcn auto-bumped `formsnap@^2.0.1` and `sveltekit-superforms@^2.30.0` into `src/web/package.json`/`bun.lock`); reverted to `true` before commit.

GREEN test: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts` → `22 pass, 0 fail`.

Implementation notes:
- **`formsnap` + `svelte-toolbelt` exports patches.** `formsnap@2.0.1` and its transitive `svelte-toolbelt@0.5.0` ship `package.json` `exports` maps with only `types` + `svelte` conditions — no `default`/`import`. Bun's runtime resolver walks conditions in order and bails when it hits a `null`/missing match, so `import * as FormPrimitive from "formsnap"` from `form/index.ts` throws `Cannot find package 'formsnap'` (and downstream `Cannot find package 'svelte-toolbelt'` once formsnap resolves). Workaround: `bun patch formsnap@2.0.1` + `bun patch svelte-toolbelt@0.5.0`, add `"default": "./dist/index.js"` to each `exports["."]` map, `bun patch --commit`. Two `*.patch` files land in `src/web/patches/` and `package.json` gains `"patchedDependencies"` — auto-replayed on every `bun install`. Vite/svelte-check work fine without the patch (they pass `--conditions svelte`); the patch only fixes raw `bun test` resolution.
- **Transitive `input-group/` install.** `form/form-input.svelte` (auto-pulled by `add form`) imports from `$lib/components/ui/input-group`, so `bunx shadcn-svelte add form` auto-pulled `input-group`. Not covered by sub-task ownership but harmless — sits in the `ui/` tree alongside the others. No smoke-test entry added (spec doesn't list it).
- **Re-installs of earlier waves.** `add -y --overwrite form` re-emitted `button/`, `input/`, `textarea/`, `label/` (form barrel imports from those siblings). Identical content to 01.2 output — no behavioural diff.

Gates: `bun test ./src/web/src/lib/utils.test.ts` → 2 pass (regression). `cd src/web && bun run check` → 2152 files, 0 errors / 0 warnings. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.

TODO: 01.4 + 01.5 patches dropped — `bun test --conditions=svelte` resolves the issue cleanly. No upstream tracking needed.

### 01.5 — 2026-04-30 (implementer)

RED command: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts`

RED output (first lines):
```
bun test v1.3.13 (bf2e2cec)

src/web/src/lib/components/ui/ui-primitives.smoke.test.ts:
error: Cannot find module '$lib/components/ui/sonner' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/ui/ui-primitives.smoke.test.ts'
(fail) shadcn-svelte primitives smoke > Toaster is a function [0.17ms]
```

22 prior pass + 1 new fail = 23 tests.

GREEN commands (run from `src/web`):
```
bunx shadcn-svelte@latest add -y --overwrite sonner
bun add svelte-sonner mode-watcher lucide-svelte valibot marked dompurify
bun add -d @types/dompurify @types/marked
```

Toggled `bunfig.toml` `frozenLockfile = true → false` for the install commands and during `bun patch` cycles below; reverted to `true` before commit.

GREEN test: `bun test ./src/web/src/lib/components/ui/ui-primitives.smoke.test.ts` → `23 pass, 0 fail`.

Implementation notes:
- **`sveltekit-superforms` + `formsnap` skipped.** Both arrived in 01.4 as transitives of the `form` component — already in `src/web/package.json`. Per spec note, this lane only adds `svelte-sonner mode-watcher lucide-svelte valibot marked dompurify` (+ `@types/*`).
- 01.4 + 01.5 patches dropped — `bun test --conditions=svelte` resolves the issue cleanly. No upstream tracking needed.
- **`@lucide/svelte` already present.** 01.1 init pulled `@lucide/svelte`; this lane added `lucide-svelte` per spec verbatim. Not currently imported but installed for future feature waves (kanban/runs icons).

Gates: `bun test ./src/web/src/lib/utils.test.ts` → 2 pass (regression). `cd src/web && bun run check` → 2194 files, 0 errors / 0 warnings. `cd src/web && bun run build` → ok. `bun run ci` → all 9 stages green.
