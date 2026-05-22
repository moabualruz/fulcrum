<script lang="ts">
	import { onMount } from "svelte";
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

	const radiusTokens = [
		{ token: "--radius-sm", className: "rounded-sm", label: "Small" },
		{ token: "--radius-md", className: "rounded-md", label: "Medium" },
		{ token: "--radius-lg", className: "rounded-lg", label: "Large" },
		{ token: "--radius-xl", className: "rounded-xl", label: "Extra large" },
		{ token: "--radius-2xl", className: "rounded-2xl", label: "2x large" },
		{ token: "--radius-3xl", className: "rounded-3xl", label: "3x large" },
		{ token: "--radius-4xl", className: "rounded-4xl", label: "4x large" },
	];

	const shadowTokens = [
		{ token: "--shadow-xs", className: "shadow-xs", label: "Extra small" },
		{ token: "--shadow-sm", className: "shadow-sm", label: "Small" },
		{ token: "--shadow-md", className: "shadow-md", label: "Medium" },
		{ token: "--shadow-lg", className: "shadow-lg", label: "Large" },
		{ token: "--shadow-xl", className: "shadow-xl", label: "Extra large" },
	];

	const { data }: { data: PageData } = $props();
	let mode = $state(data.mode as TokenMode);
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>Design System Token Specimen</title>
</svelte:head>

<main
	data-token-scope
	data-hydrated={hydrated}
	data-theme={mode}
	class="min-h-screen bg-surface px-6 py-8 text-fg sm:px-8"
>
	<section class="mx-auto flex max-w-6xl flex-col gap-6">
		<header class="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-3xl">
				<p class="text-xs font-medium uppercase text-fg-muted">Design system foundation</p>
				<h1 class="mt-2 text-2xl font-semibold text-fg">Color token specimen</h1>
				<p class="mt-2 text-sm text-fg-subtle">
					OKLCH semantic roles from DESIGN.md, mirrored through Tailwind theme variables and runtime mode switching.
				</p>
			</div>
			<div class="flex gap-2" aria-label="Token mode">
				{#each tokenModes as tokenMode}
					<button
						type="button"
						data-mode-button={tokenMode}
						onclick={() => (mode = tokenMode)}
						class="rounded-md border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
						data-active={mode === tokenMode}
					>
						{tokenMode}
					</button>
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

		<section data-radius-token-grid class="grid gap-3 lg:grid-cols-7">
			{#each radiusTokens as radius}
				<article
					data-radius-token={radius.token}
					class={`${radius.className} border border-border bg-surface-elevated p-4 shadow-sm`}
				>
					<div class="space-y-1">
						<h2 class="text-sm font-semibold text-fg">{radius.label}</h2>
						<p class="font-mono text-xs text-fg-muted">{radius.token}</p>
					</div>
				</article>
			{/each}
		</section>

		<section data-radius-component-contracts class="grid gap-3 md:grid-cols-3">
			<button
				type="button"
				data-radius-button
				class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
			>
				Button
			</button>

			<article data-radius-card class="rounded-lg border border-border bg-surface-elevated p-4 shadow-sm">
				<h2 class="text-sm font-semibold text-fg">Card</h2>
				<p class="mt-1 text-xs text-fg-muted">Foundation surface</p>
			</article>

			<div
				data-radius-modal
				role="dialog"
				aria-label="Radius modal specimen"
				class="rounded-xl border border-border bg-surface-elevated p-4 shadow-sm"
			>
				<h2 class="text-sm font-semibold text-fg">Modal</h2>
				<p class="mt-1 text-xs text-fg-muted">Overlay surface</p>
			</div>

			<article
				data-radius-override
				class="rounded-3xl border border-border bg-surface-elevated p-4 text-sm font-medium text-fg shadow-sm md:col-span-3"
			>
				Override specimen
			</article>
		</section>

		<section data-shadow-token-grid class="grid gap-3 md:grid-cols-5">
			{#each shadowTokens as shadow}
				<article
					data-shadow-token={shadow.token}
					class={`${shadow.className} rounded-lg border border-border bg-surface-elevated p-4`}
				>
					<div class="space-y-1">
						<h2 class="text-sm font-semibold text-fg">{shadow.label}</h2>
						<p class="font-mono text-xs text-fg-muted">{shadow.token}</p>
					</div>
				</article>
			{/each}
		</section>

		<section data-shadow-component-contracts class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			<div
				data-shadow-popover
				role="tooltip"
				class="rounded-md border border-border bg-surface-elevated p-4 shadow-sm"
			>
				<h2 class="text-sm font-semibold text-fg">Popover</h2>
				<p class="mt-1 text-xs text-fg-muted">Small elevation</p>
			</div>

			<div data-shadow-dropdown class="rounded-md border border-border bg-surface-elevated p-4 shadow-md">
				<h2 class="text-sm font-semibold text-fg">Dropdown</h2>
				<p class="mt-1 text-xs text-fg-muted">Menu elevation</p>
			</div>

			<div
				data-shadow-dialog
				role="dialog"
				aria-label="Shadow modal specimen"
				class="rounded-xl border border-border bg-surface-elevated p-4 shadow-lg"
			>
				<h2 class="text-sm font-semibold text-fg">Modal</h2>
				<p class="mt-1 text-xs text-fg-muted">Overlay elevation</p>
			</div>

			<article
				data-shadow-hover-card
				class="rounded-lg border border-border bg-surface-elevated p-4 shadow-sm transition-shadow hover:shadow-md"
			>
				<h2 class="text-sm font-semibold text-fg">Hover card</h2>
				<p class="mt-1 text-xs text-fg-muted">Hover raises one level</p>
			</article>

			<input
				data-shadow-input
				aria-label="Input without shadow"
				class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg xl:col-span-2"
				value="No input shadow"
				readonly
			/>

			<p data-shadow-text class="text-sm text-fg-muted xl:col-span-2">Text keeps zero elevation.</p>
		</section>
	</section>
</main>
