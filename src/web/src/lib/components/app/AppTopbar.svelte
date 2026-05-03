<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import Sun from "@lucide/svelte/icons/sun";

	import { buttonVariants } from "$lib/components/ui/button";
	import BellBadge from "$lib/components/app/BellBadge.svelte";
	import { cn } from "$lib/utils.js";

	interface BellItem {
		id: string;
		kind: string;
		title: string;
	}

	interface Props {
		pathname: string;
		activeProjectId: string | null;
		bellCount?: number;
		bellItems?: BellItem[];
		onBellOpen?: () => void;
		onThemeToggle?: () => void;
		bellCount?: number;
	}

	let {
		pathname,
		activeProjectId,
		bellCount = 0,
		bellItems = [],
		onBellOpen = () => {},
		onThemeToggle = () => {},
		bellCount = 0,
	}: Props = $props();

	interface Crumb {
		label: string;
		href: string;
	}

	// Splits a pathname into breadcrumb segments. Root collapses to a single
	// "Dashboard" crumb; deeper paths prepend Dashboard then capitalise each
	// segment. Kept inline (no export) so tests verify rendered output, not
	// the helper itself.
	function crumbsFor(p: string): Crumb[] {
		const segments = p.split("/").filter((s) => s.length > 0);
		const out: Crumb[] = [{ label: "Dashboard", href: "/" }];
		let acc = "";
		for (const seg of segments) {
			acc += `/${seg}`;
			out.push({
				label: seg.charAt(0).toUpperCase() + seg.slice(1),
				href: acc,
			});
		}
		return out;
	}

	let crumbs = $derived(crumbsFor(pathname));
</script>

<header
	class={cn("flex h-14 items-center gap-4 border-b border-border px-6")}
	data-app-topbar
>
	<nav data-slot="breadcrumb" aria-label="breadcrumb">
		<ol
			data-slot="breadcrumb-list"
			class={cn("flex items-center gap-1.5 text-sm")}
		>
			{#each crumbs as crumb, i (crumb.href)}
				{@const isLast = i === crumbs.length - 1}
				<li data-slot="breadcrumb-item" class={cn("inline-flex items-center")}>
					{#if isLast}
						<span
							data-slot="breadcrumb-page"
							aria-current="page"
							class={cn("text-foreground font-normal")}
						>{crumb.label}</span>
					{:else}
						<a
							data-slot="breadcrumb-link"
							href={crumb.href}
							class={cn("text-muted-foreground hover:text-foreground transition-colors")}
						>{crumb.label}</a>
					{/if}
				</li>
				{#if !isLast}
					<li
						data-slot="breadcrumb-separator"
						aria-hidden="true"
						class={cn("text-muted-foreground")}
					>/</li>
				{/if}
			{/each}
		</ol>
	</nav>

	<div class={cn("ml-auto flex items-center gap-2")}>
		<BellBadge count={bellCount} />
		<kbd
			class={cn(
				"hidden h-6 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs sm:inline-flex",
			)}
			aria-label="open command palette">⌘K</kbd
		>
		<button
			type="button"
			data-slot="button"
			data-theme-toggle
			aria-label="toggle theme"
			onclick={onThemeToggle}
			class={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
		>
			<Sun aria-hidden="true" />
		</button>
		<div class={cn("relative")}>
			<button
				type="button"
				data-slot="button"
				data-notification-bell
				aria-label="open notifications"
				onclick={onBellOpen}
				class={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
			>
				<Bell aria-hidden="true" />
				{#if bellCount > 0}
					<span
						data-notification-badge
						class={cn(
							"absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground",
						)}
					>{bellCount}</span>
				{/if}
			</button>
			{#if bellItems.length > 0}
				<div
					data-notification-dropdown
					class={cn("absolute right-0 z-20 mt-2 w-72 rounded-md border border-border bg-popover p-2 text-sm shadow-md")}
				>
					{#each bellItems.slice(0, 5) as item (item.id)}
						<div class={cn("flex gap-2 py-1.5")}>
							<span class={cn("text-muted-foreground")}>{item.kind}</span>
							<span>{item.title}</span>
						</div>
					{/each}
					<a href="/inbox" class={cn("block border-t border-border pt-2 text-xs text-muted-foreground hover:text-foreground")}>See all</a>
				</div>
			{/if}
		</div>
		<span
			class={cn("text-xs text-muted-foreground")}
			data-active-project>{activeProjectId ?? "—"}</span
		>
	</div>
</header>
