<script lang="ts">
	import type { Snippet } from "svelte";
	import { ModeWatcher, toggleMode } from "mode-watcher";
	import { Toaster } from "svelte-sonner";

	import { page } from "$app/state";
	import favicon from "$lib/assets/favicon.svg";
	import { toastFromForm } from "$lib/feedback/use-form-toast";
	import AppSidebar from "$lib/components/app/AppSidebar.svelte";
	import AppTopbar from "$lib/components/app/AppTopbar.svelte";
	import * as Sheet from "$lib/components/ui/sheet";
	import { buttonVariants } from "$lib/components/ui/button";
	import {
		MOBILE_QUERY,
		browserDriver,
		isMobileViewport,
	} from "$lib/util/media-query";
	import { cn } from "$lib/utils.js";

	import "../app.css";
	import type { LayoutData } from "./$types";

	interface Props {
		data: LayoutData;
		children?: Snippet;
	}

	let { data, children }: Props = $props();

	let mobile = $state(isMobileViewport(browserDriver()));
	let sheetOpen = $state(false);

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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster richColors closeButton position="top-right" />

<div class={cn("flex min-h-screen bg-background text-foreground")}>
	{#if mobile}
		<Sheet.Root bind:open={sheetOpen}>
			<Sheet.Content side="left" class="w-64 p-0">
				<AppSidebar activeProjectId={data.activeProjectId} />
			</Sheet.Content>
			<div class={cn("flex min-w-0 flex-1 flex-col")}>
				<div class={cn("flex items-center")}>
					<Sheet.Trigger
						data-mobile-sheet-trigger
						aria-label="open navigation"
						class={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"ml-2",
						)}
					>
						☰
					</Sheet.Trigger>
					<div class="flex-1">
						<AppTopbar
							pathname={page.url.pathname}
							activeProjectId={data.activeProjectId}
							onThemeToggle={toggleMode}
						/>
					</div>
				</div>
				<main class={cn("flex-1 px-6 py-6")}>
					{@render children?.()}
				</main>
			</div>
		</Sheet.Root>
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
					/>
				</div>
			</div>
			<main class={cn("flex-1 px-6 py-6")}>
				{@render children?.()}
			</main>
		</div>
	{/if}
</div>
