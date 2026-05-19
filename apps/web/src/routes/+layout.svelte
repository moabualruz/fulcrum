<script lang="ts">
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import { ModeWatcher, toggleMode } from "mode-watcher";
	import { Toaster } from "svelte-sonner";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import favicon from "$lib/assets/favicon.svg";
	import { toastFromForm } from "$lib/feedback/use-form-toast";
	import AppSidebar from "$lib/components/app/AppSidebar.svelte";
	import AppTopbar from "$lib/components/app/AppTopbar.svelte";
	import TraceFooter from "$lib/components/app/TraceFooter.svelte";
	import CommandPalette from "$lib/components/command-palette/CommandPalette.svelte";
	import { makeKeydownHandler } from "$lib/components/command-palette/command-palette-handlers";
	import { buildProjectCommandItems } from "$lib/components/command-palette/project-command-items";
	import ShortcutHelpOverlay from "$lib/components/ShortcutHelpOverlay.svelte";
	import { Sheet, SheetContent, SheetTrigger } from "@fulcrum/ui-kit";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import {
		MOBILE_QUERY,
		browserDriver,
		isMobileViewport,
	} from "$lib/util/media-query";
	import { cn } from "$lib/utils.js";

	import type { InferenceStatus } from "$lib/components/app/AppTopbar.svelte";

	import "../app.css";
	import type { LayoutData } from "./$types";

	interface Props {
		data: LayoutData;
		children?: Snippet;
	}

	let { data, children }: Props = $props();

	let mobile = $state(isMobileViewport(browserDriver()));
	let sheetOpen = $state(false);
	let paletteOpen = $state(false);
	let shortcutHelpOpen = $state(false);
	let inferenceStatus = $state<InferenceStatus>("unknown");
	const commandKeydownHandler = makeKeydownHandler(() => paletteOpen, (next) => (paletteOpen = next));

	// Poll inference sidecar health every 30s (client-side only)
	$effect(() => {
		if (typeof window === "undefined" || typeof fetch !== "function") return;
		let cancelled = false;
		async function poll() {
			try {
				const res = await fetch("/api/inference/health");
				if (!res.ok) { inferenceStatus = "unreachable"; return; }
				const data = await res.json();
				inferenceStatus = data.status ?? "unreachable";
			} catch {
				inferenceStatus = "unreachable";
			}
		}
		void poll();
		const id = setInterval(() => { if (!cancelled) void poll(); }, 30_000);
		return () => { cancelled = true; clearInterval(id); };
	});

	const paletteItems = $derived(buildProjectCommandItems({ activeProjectId: data.activeProjectId }));

	$effect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function")
			return;
		const mql = window.matchMedia(MOBILE_QUERY);
		mobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			mobile = e.matches;
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	});

	$effect(() => {
		toastFromForm(page.form as Parameters<typeof toastFromForm>[0]);
	});

	$effect(() => {
		if (page.url.searchParams.get("e2e_palette") === "1") paletteOpen = true;
		if (page.url.searchParams.get("e2e_help") === "1") shortcutHelpOpen = true;
	});

	$effect(() => {
		if (typeof window === "undefined") return;
		document.body.dataset.fulcrumHydrated = "true";
		return () => {
			delete document.body.dataset.fulcrumHydrated;
		};
	});

	onMount(() => {
		window.addEventListener("keydown", onGlobalKeydown);
		window.addEventListener("keyup", onGlobalKeyup);
		const openHelp = () => (shortcutHelpOpen = true);
		window.addEventListener("fulcrum:open-shortcut-help", openHelp);
		return () => {
			window.removeEventListener("keydown", onGlobalKeydown);
			window.removeEventListener("keyup", onGlobalKeyup);
			window.removeEventListener("fulcrum:open-shortcut-help", openHelp);
		};
	});

	function onGlobalKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const tag = typeof target?.tagName === "string" ? target.tagName.toLowerCase() : "";
		if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
			if (tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
				event.preventDefault();
				shortcutHelpOpen = true;
				return;
			}
		}
		if (typeof event.key === "string" && event.key.toLowerCase() === "k" && tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
			event.preventDefault();
			paletteOpen = !paletteOpen;
			return;
		}
		commandKeydownHandler(event);
	}

	function onGlobalKeyup(event: KeyboardEvent) {
		if (event.key === "Meta" || event.key === "Control") {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName.toLowerCase();
			if (tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
				paletteOpen = true;
			}
		}
	}
</script>

<svelte:head>
	<title>Fulcrum</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />

<!-- Toast region: aria-live so screen readers announce toasts without overwhelming them -->
<div
	data-toast-region
	aria-live="polite"
	aria-atomic="false"
	aria-label="Notifications"
>
	<Toaster richColors closeButton position="top-right" />
</div>

<CommandPalette
	items={paletteItems}
	open={paletteOpen}
	onOpenChange={(next) => (paletteOpen = next)}
	onSelect={(item) => {
		if (item.href) void goto(item.href);
	}}
/>

<ShortcutHelpOverlay open={shortcutHelpOpen} onClose={() => (shortcutHelpOpen = false)} />

<!-- Skip link: must be first focusable element; becomes visible on focus -->
<a
	href="#main-content"
	id="skip-to-content"
	class={cn(
		"sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999]",
		"focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring",
	)}
>Skip to main content</a>

<div class={cn("flex min-h-screen bg-background text-foreground")}>
	{#if mobile}
		<Sheet bind:open={sheetOpen}>
			<SheetContent side="left" class="w-64 p-0" aria-label="Navigation menu">
				<AppSidebar activeProjectId={data.activeProjectId} />
			</SheetContent>
			<div class={cn("flex min-w-0 flex-1 flex-col")}>
				<div class={cn("flex items-center pt-[var(--fulcrum-safe-area-top)]")}>
					<SheetTrigger
						data-mobile-sheet-trigger
						aria-label="Open navigation menu"
						aria-expanded={sheetOpen}
						class={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"ml-2",
						)}
					>
						<span aria-hidden="true">☰</span>
					</SheetTrigger>
					<div class="flex-1">
						<AppTopbar
							pathname={page.url.pathname}
							activeProjectId={data.activeProjectId}
							onThemeToggle={toggleMode}
						/>
					</div>
				</div>
				<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 pt-6 pb-[calc(1.5rem+var(--fulcrum-gesture-zone-bottom))]")}>
					{@render children?.()}
				</main>
				<TraceFooter traceId={data?.traceId ?? null} requestId={data?.requestId ?? null} />
			</div>
		</Sheet>
	{:else}
		<div class={cn("sticky top-0 h-screen")}>
			<AppSidebar activeProjectId={data.activeProjectId} />
		</div>
		<div class={cn("flex min-w-0 flex-1 flex-col")}>
			<div class={cn("flex items-center")}>
				<div class="flex-1">
					<AppTopbar
						pathname={page.url.pathname}
						activeProjectId={data.activeProjectId}
						onThemeToggle={toggleMode}
						{inferenceStatus}
					/>
				</div>
			</div>
			<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 py-6")}>
				{@render children?.()}
			</main>
			<TraceFooter traceId={data?.traceId ?? null} requestId={data?.requestId ?? null} />
		</div>
	{/if}
</div>
