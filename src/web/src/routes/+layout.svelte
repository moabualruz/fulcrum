<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { Snippet } from "svelte";
	import { ModeWatcher, toggleMode } from "mode-watcher";
	import { Toaster } from "svelte-sonner";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import favicon from "$lib/assets/favicon.svg";
	import { toastFromForm } from "$lib/feedback/use-form-toast";
	import AppSidebar from "$lib/components/app/AppSidebar.svelte";
	import AppTopbar from "$lib/components/app/AppTopbar.svelte";
	import CommandPalette from "$lib/components/command-palette/CommandPalette.svelte";
	import * as Sheet from "$lib/components/ui/sheet";
	import { buttonVariants } from "$lib/components/ui/button";
	import {
		MOBILE_QUERY,
		browserDriver,
		isMobileViewport,
	} from "$lib/util/media-query";
	import { cn } from "$lib/utils.js";
	import { BellCounterPoll, type BellCounterItem } from "../../../notifications/bell-counter-poll";

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
	let bellCount = $state(0);
	let bellItems = $state<BellCounterItem[]>([]);
	let bellPoll: BellCounterPoll<ReturnType<typeof setInterval>> | null = null;

	const paletteItems = [
		{ id: "home",     label: "Dashboard",  href: "/" },
		{ id: "projects", label: "Projects",   href: "/projects" },
		{ id: "docs",     label: "Documents",  href: "/docs" },
		{ id: "boards",   label: "Boards",     href: "/boards" },
		{ id: "runs",     label: "Agent runs", href: "/runs" },
		{ id: "search",   label: "Search",     href: "/search" },
	];

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

	async function trpc<T>(procedure: string, input: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
		const response = await fetch(`/api/trpc/${procedure}`, {
			method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ json: input }),
		});
		if (!response.ok) throw new Error(await response.text());
		const payload = await response.json();
		return (payload.result?.data?.json ?? payload.result?.data ?? payload.json ?? payload) as T;
	}

	onMount(() => {
		bellPoll = new BellCounterPoll<ReturnType<typeof setInterval>>({
			realtimeEnabled: false,
			unreadCount: () => trpc("notify.unreadCount", {}),
			listUnread: (input) => trpc("notify.list", input),
			markAllRead: () => trpc("notify.markAllRead", {}),
			onCount: (count) => {
				bellCount = count;
			},
		});
		void bellPoll.start();
	});

	onDestroy(() => {
		bellPoll?.stop();
	});

	$effect(() => {
		if (page.url.pathname === "/inbox" && bellCount > 0) {
			void bellPoll?.clearForInboxVisit();
		}
	});

	async function openBell(): Promise<void> {
		const unread = await bellPoll?.openDropdown();
		bellItems = unread?.items ?? [];
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster richColors closeButton position="top-right" />

<CommandPalette
	items={paletteItems}
	open={paletteOpen}
	onOpenChange={(next) => (paletteOpen = next)}
	onSelect={(item) => {
		if (item.href) void goto(item.href);
	}}
/>

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
							bellCount={bellCount}
							bellItems={bellItems}
							onBellOpen={() => void openBell()}
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
						bellCount={bellCount}
						bellItems={bellItems}
						onBellOpen={() => void openBell()}
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
