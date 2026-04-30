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

Acceptance criteria:
- `bunx shadcn-svelte@latest init` runs cleanly with: SvelteKit + TypeScript + Tailwind v4 + base color `zinc` + component path `$lib/components/ui` + utils path `$lib/utils`.
- Components added: `button`, `card`, `badge`, `dialog`, `alert-dialog`, `input`, `label`, `textarea`, `select`, `table`, `tabs`, `dropdown-menu`, `sheet`, `separator`, `skeleton`, `scroll-area`, `avatar`, `command`, `tooltip`, `sonner`, `popover`, `breadcrumb`, `form`.
- `mode-watcher` and `lucide-svelte` are direct dependencies.
- `bun run check` and `bun run build` exit 0.
- `app.css` imports tailwindcss + the shadcn theme tokens.
- `svelte.config.js` uses `@sveltejs/adapter-node`.
