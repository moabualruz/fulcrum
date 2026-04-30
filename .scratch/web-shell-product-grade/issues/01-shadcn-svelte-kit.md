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

- [ ] **01.1 — Scaffold `components.json` + base CSS theme.** Owns: `src/web/components.json`, `src/web/src/app.css`, `src/web/src/lib/utils.ts`. RED: `src/web/src/lib/components/ui/utils.test.ts` imports `cn` and asserts `cn("a", false && "b", "c") === "a c"`. GREEN: run `bunx shadcn-svelte@latest init --base-color zinc --css src/app.css --lib-alias '$lib' --components-alias '$lib/components' --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui'`. Verify: `bun run check`.
- [ ] **01.2 — Install primitive components wave.** Owns: `src/web/src/lib/components/ui/{button,card,badge,input,label,textarea,select}/`. RED: `ui-primitives.smoke.test.ts` imports each and asserts each is a function. GREEN: `bunx shadcn-svelte@latest add -y button card badge input label textarea select`.
- [ ] **01.3 — Install layout primitives.** Owns: `src/web/src/lib/components/ui/{table,tabs,sheet,separator,skeleton,scroll-area,avatar,breadcrumb}/`. RED: extend the smoke test with these names. GREEN: `bunx shadcn-svelte@latest add -y table tabs sheet separator skeleton scroll-area avatar breadcrumb`.
- [ ] **01.4 — Install overlay primitives.** Owns: `src/web/src/lib/components/ui/{dialog,alert-dialog,dropdown-menu,popover,tooltip,command,form}/`. RED: extend smoke test. GREEN: `bunx shadcn-svelte@latest add -y dialog alert-dialog dropdown-menu popover tooltip command form`.
- [ ] **01.5 — Toaster + form validation deps.** Owns: `src/web/package.json`, `src/web/src/lib/components/ui/sonner/`. RED: smoke imports `Toaster`. GREEN: `bunx shadcn-svelte@latest add -y sonner` then `bun add svelte-sonner mode-watcher lucide-svelte sveltekit-superforms valibot marked dompurify`.
- [ ] **01.6 — Post-install gate.** Owns: nothing new. RED: `bun run check && bun run build` should already be green; if not, fix imports. GREEN: both exit 0. Commit `feat(web): add shadcn-svelte component kit + form/toast/markdown deps`.
