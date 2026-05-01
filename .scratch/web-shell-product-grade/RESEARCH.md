---
name: web-shell-product-grade research note
description: install commands, API shapes, and test patterns for the web-shell rebuild
type: reference
---

## 01. shadcn-svelte 1.2 install matrix

CLI writes source files to `$lib/components/ui/<name>/`. Init prompts have flag equivalents — use flags for non-interactive scripts.

```bash
bunx shadcn-svelte@latest init --base-color zinc --css src/app.css \
  --lib-alias '$lib' --components-alias '$lib/components' \
  --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' \
  --ui-alias '$lib/components/ui'

bunx shadcn-svelte@latest add -y \
  button card badge dialog alert-dialog input label textarea \
  select table tabs dropdown-menu sheet separator skeleton \
  scroll-area avatar command tooltip sonner popover breadcrumb form
```

Files: `src/lib/components/ui/<component>/index.ts` + `<component>.svelte`. Source: <https://shadcn-svelte.com/docs/cli>

## 02. components.json shape

`baseColor` immutable after init — commit to `zinc`. Aliases match SvelteKit `$lib`.

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "tailwind": { "css": "src/app.css", "baseColor": "zinc" },
  "aliases": {
    "lib": "$lib", "utils": "$lib/utils",
    "components": "$lib/components", "ui": "$lib/components/ui",
    "hooks": "$lib/hooks"
  },
  "typescript": true,
  "registry": "https://shadcn-svelte.com/registry"
}
```

Source: <https://shadcn-svelte.com/docs/components-json>

## 03. Svelte 5 runes + SvelteKit 2 patterns

`$props` destructures inputs; `$state` reactive; `$derived` pure computed; `$effect` side-effect. Snippets `{#snippet}`/`{@render}` replace slots. Never mutate props — use callback props or `$bindable`.

```svelte
<script lang="ts">
  interface Props { initial?: number; onChange?: (n: number) => void }
  let { initial = 0, onChange }: Props = $props();
  let count = $state(initial);
  let doubled = $derived(count * 2);
  $effect(() => onChange?.(count));
</script>
<button onclick={() => count++}>{count} ({doubled})</button>
```

Source: <https://svelte.dev/docs/svelte/$props>

## 04. SvelteKit form actions + use:enhance

`+page.server.ts` exports `actions = { default | <named>: async (event) => ... } satisfies Actions`. Default fires on bare `<form method="POST">`; named via `action="?/foo"`. `use:enhance` upgrades to fetch + populates `form` prop.

```ts
// +page.server.ts
import type { Actions } from "./$types";
export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    return { success: true };
  }
} satisfies Actions;
```
```svelte
<script lang="ts">
  import { enhance } from "$app/forms";
  let { form } = $props();
</script>
<form method="POST" use:enhance>...</form>
```
Source: <https://svelte.dev/docs/kit/form-actions>

## 05. Cookie-persisted active project + streamed loads

Read in `+layout.server.ts`, populate `event.locals`, return for layout. Set via server action with `path: "/"` (required). Returning un-awaited promise streams; pages render skeletons via `{#await}` — use for slow PGlite reads.

```ts
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from "./$types";
export const load: LayoutServerLoad = async ({ cookies, locals }) => {
  const activeProjectId = cookies.get("fulcrum_active_project") ?? null;
  locals.activeProjectId = activeProjectId;
  return {
    activeProjectId,
    projects: getProjects(),         // awaited (fast)
    recentRuns: streamRecentRuns()   // promise, streamed
  };
};
// inside an action:
cookies.set("fulcrum_active_project", id, { path: "/", sameSite: "lax", httpOnly: false });
```

Source: <https://svelte.dev/docs/kit/load>

## 07. mode-watcher dark mode

Persists light/dark/system to localStorage. Mount `<ModeWatcher />` once in root layout; call `setMode(...)` / `toggleMode()`. README uses Svelte 5 runes.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { ModeWatcher, setMode } from "mode-watcher";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  let { children } = $props();
</script>
<ModeWatcher />
<DropdownMenu.Item onclick={() => setMode("light")}>Light</DropdownMenu.Item>
<DropdownMenu.Item onclick={() => setMode("dark")}>Dark</DropdownMenu.Item>
<DropdownMenu.Item onclick={() => setMode("system")}>System</DropdownMenu.Item>
{@render children()}
```
Source: <https://github.com/svecosystem/mode-watcher>

## 08. svelte-sonner toasts

Canonical name is `svelte-sonner` (NOT `sonner-svelte`). Shadcn `sonner` component already wraps Toaster — use that. API: `toast.success`, `toast.error`, `toast.promise`. Svelte 5 OK.

```svelte
<!-- root layout -->
<script lang="ts">import { Toaster } from "$lib/components/ui/sonner";</script>
<Toaster richColors closeButton />
```
```ts
import { toast } from "svelte-sonner";
toast.success("Project created"); toast.error("Failed to save");
```
Source: <https://github.com/wobsoriano/svelte-sonner>

## 09. svelte-dnd-action

Production-ready, peer `svelte >= 3.23.0` — works with Svelte 5 (use `onconsider`/`onfinalize`). Both events fire `e.detail = { items, info }`; cross-list drop = `info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER`. `aria-label` on container AND items required for screen-reader output.

```svelte
<script lang="ts">
  import { dndzone, TRIGGERS } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  let items = $state([{ id: "1", title: "..." }]);
  function onfinalize(e: CustomEvent<{ items: typeof items; info: { trigger: string } }>) {
    items = e.detail.items;
    if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) save(items);
  }
</script>
<section aria-label="Todo" use:dndzone={{ items, flipDurationMs: 150 }}
  onconsider={(e) => (items = e.detail.items)} onfinalize={onfinalize}>
  {#each items as it (it.id)}
    <div aria-label={it.title} animate:flip={{ duration: 150 }}>{it.title}</div>
  {/each}
</section>
```

Source: <https://github.com/isaacHagoel/svelte-dnd-action>

## 10. CodeMirror 6 + svelte-codemirror-editor

v2.x supports Svelte 5 runes. Props: `value`, `lang`, `theme`, `extensions`, `lineNumbers`, `editable`, `readonly`, `placeholder`. Events: `on:change`, `onready`. jsdom can't fully render `EditorView` — component tests assert wrapper only; full interaction in Playwright.

```svelte
<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  let value = $state("# hello");
</script>
<CodeMirror bind:value lang={markdown()} theme={oneDark} placeholder="Write..." />
```

Source: <https://github.com/touchifyapp/svelte-codemirror-editor>

## 11. Vitest + @testing-library/svelte (Svelte 5)

`@testing-library/svelte` supports Svelte 3/4/5. Pair with official `svelteTesting` Vite plugin for auto-cleanup. Naming: `*.svelte.test.ts` for component tests (jsdom), `*.test.ts` for plain TS units. `vitest-browser-svelte` requires Vitest 4 — defer; use jsdom + testing-library now.

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,svelte.test}.ts"],
    setupFiles: ["./vitest-setup.ts"]
  }
});
```

Source: <https://github.com/testing-library/svelte-testing-library>

## 12. Playwright + SvelteKit dev server

`webServer` boots dev server, waits on URL. `reuseExistingServer: !process.env.CI` so CI always boots fresh.

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore", stderr: "pipe"
  }
});
```

Source: <https://playwright.dev/docs/test-webserver>

## 13. axe-core in Vitest component tests

Use `axe-core` directly (not `vitest-axe` / `jest-axe` — wrap older versions). Filter to `serious` + `critical` only — minor/moderate noise on shadcn primitives.

```ts
import { render } from "@testing-library/svelte";
import axe from "axe-core";
import { expect, test } from "vitest";
import Button from "$lib/components/ui/button/button.svelte";

test("Button no serious a11y violations", async () => {
  const { container } = render(Button, { props: { children: "Save" } });
  const results = await axe.run(container);
  const blockers = results.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(blockers).toEqual([]);
});
```

Source: <https://github.com/dequelabs/axe-core/blob/develop/doc/API.md>

## 14. Markdown render + sanitise

`svelte-markdown` last published 0.4.1 (Dec 2023) — no Svelte 5, do NOT use. Use `marked` + `dompurify` directly. Marked README explicitly says "use a sanitize library, like DOMPurify (recommended)". On the server use `isomorphic-dompurify` (auto-wires JSDOM); browser-side Just Works.

```ts
// src/lib/markdown.ts
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src) as string);
}
```

Source: <https://github.com/markedjs/marked>, <https://github.com/cure53/DOMPurify>

## 15. Form validation: sveltekit-superforms + valibot

Pick `sveltekit-superforms` + `valibot`. Why: superforms is the canonical SvelteKit forms lib (SSR errors, progressive enhancement, file uploads); valibot is ~10x smaller bundle than zod with identical ergonomics; superforms ships first-class `valibot` adapter. zod is fine if team already knows it — valibot wins on bundle.

```ts
// +page.server.ts
import { superValidate, fail } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import * as v from "valibot";
const schema = v.object({ name: v.pipe(v.string(), v.minLength(1)) });
export const load = async () => ({ form: await superValidate(valibot(schema)) });
export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, valibot(schema));
    if (!form.valid) return fail(400, { form });
    return { form };
  }
};
```

Source: <https://superforms.rocks/get-started>

## Recommendations

Implementer subagents MUST use these — no choices left:

- shadcn-svelte init flags: `--base-color zinc`, `--css src/app.css`, `--ui-alias '$lib/components/ui'`. Add all 23 components in ONE `add -y` call.
- Components write to `src/lib/components/ui/<name>/`. Import `$lib/components/ui/<name>`.
- Svelte 5 runes only: `$props`, `$state`, `$derived`, `$effect`, `{#snippet}`/`{@render}`. NO `export let`, `$:`, slots.
- Cookie name `fulcrum_active_project`. Read in `src/routes/+layout.server.ts`. Set with `path: "/"`, `sameSite: "lax"`, `httpOnly: false`.
- Dark mode: `mode-watcher` mounted in root layout; toggle via shadcn `DropdownMenu`.
- Toasts: `svelte-sonner` via shadcn `sonner` wrapper, mounted once in root layout.
- DnD: `svelte-dnd-action` with `onconsider`/`onfinalize`. Always `aria-label` on container + items. Cross-column = `TRIGGERS.DROPPED_INTO_ANOTHER`.
- Editor: `svelte-codemirror-editor` v2 + `@codemirror/lang-markdown` + `@codemirror/theme-one-dark`. Wrapper-only assertions in component tests; full interaction in Playwright.
- Tests: Vitest + jsdom + `@testing-library/svelte` + `svelteTesting()` plugin. `*.svelte.test.ts` for components; `*.test.ts` for units.
- e2e: Playwright `webServer` runs `bun run dev` on `http://localhost:5173`, `reuseExistingServer: !process.env.CI`.
- a11y: `axe-core` directly; filter to `serious` + `critical` only.
- Markdown: `marked` + `isomorphic-dompurify`. Do NOT use `svelte-markdown`.
- Forms: `sveltekit-superforms` + `valibot` adapter.
- Single most important constraint: shadcn-svelte `baseColor` is IMMUTABLE after init — commit to `zinc` now or face full re-init.
