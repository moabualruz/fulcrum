<script lang="ts">
	import type { PageData } from "./$types";

	type TokenMode = "light" | "dark" | "high-contrast";
	const tokenModes: TokenMode[] = ["light", "dark", "high-contrast"];

	const colorTokens = [
		{ token: "--primary", label: "Primary", foreground: "--primary-foreground" },
		{ token: "--accent", label: "Accent", foreground: "--accent-foreground" },
		{ token: "--surface", label: "Surface", foreground: "--fg" },
		{ token: "--bg", label: "Background", foreground: "--fg" },
		{ token: "--border", label: "Border", foreground: "--fg" },
		{ token: "--danger", label: "Danger", foreground: "--danger-foreground" },
		{ token: "--warning", label: "Warning", foreground: "--warning-foreground" },
		{ token: "--success", label: "Success", foreground: "--success-foreground" },
	];

	const { data }: { data: PageData } = $props();
	const mode = data.mode as TokenMode;
</script>

<svelte:head>
	<title>Wave 0a Foundation Tokens</title>
</svelte:head>

<main data-token-scope data-theme={mode} class="min-h-screen bg-surface px-6 py-8 text-fg sm:px-8">
	<section class="mx-auto flex max-w-6xl flex-col gap-6">
		<header class="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-3xl">
				<p class="text-xs font-medium uppercase text-fg-muted">Wave 0a foundation</p>
				<h1 class="mt-2 text-2xl font-semibold text-fg">Color token specimen</h1>
				<p class="mt-2 text-sm text-fg-subtle">
					OKLCH semantic roles from DESIGN.md, mirrored through Tailwind theme variables and runtime mode switching.
				</p>
			</div>
			<div class="flex gap-2" aria-label="Token mode">
				{#each tokenModes as tokenMode}
					<a
						href={`?mode=${tokenMode}`}
						data-mode-button={tokenMode}
						class="rounded-md border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
						data-active={mode === tokenMode}
					>
						{tokenMode}
					</a>
				{/each}
			</div>
		</header>

		<div class="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-4 py-3">
			<span class="text-sm text-fg-subtle">Active mode</span>
			<strong data-token-mode class="text-sm font-semibold text-fg">{mode}</strong>
		</div>

		<section data-color-token-grid class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{#each colorTokens as color}
				<article
					data-token={color.token}
					class="overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-sm"
				>
					<div
						class="flex min-h-28 items-end p-4"
						style={`background: var(${color.token}); color: var(${color.foreground});`}
					>
						<div>
							<h2 class="text-lg font-semibold">{color.label}</h2>
							<p class="font-mono text-xs">{color.token}</p>
						</div>
					</div>
					<div class="space-y-1 border-t border-border p-4">
						<p class="text-sm font-medium text-fg">{color.foreground}</p>
						<p class="text-xs text-fg-muted">Semantic pair uses mode-aware OKLCH values.</p>
					</div>
				</article>
			{/each}
		</section>
	</section>
</main>
