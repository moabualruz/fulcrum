<script lang="ts">
	import { page } from "$app/state";

	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	import { LUCIDE_ICONS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

	interface Props {
		activeProjectId: string | null;
	}

	let { activeProjectId }: Props = $props();

	// Inline the shadcn ghost-button surface as a raw `<a>` so SSR-only
	// component tests can render the sidebar without dragging the Button
	// component (and its bits-ui dependency) into Svelte's server compiler.
	function isCurrent(item: NavItem, pathname: string): boolean {
		if (item.href === "/") return pathname === "/";
		return pathname === item.href || pathname.startsWith(`${item.href}/`);
	}
</script>

<aside
	aria-label="primary navigation"
	class={cn(
		"bg-sidebar text-sidebar-foreground flex h-full w-56 flex-col border-r",
	)}
>
	<nav class={cn("flex flex-col gap-1 p-3")} aria-label="primary">
		{#each NAV_ITEMS as item (item.href)}
			{@const Icon = LUCIDE_ICONS[item.iconName]}
			{@const current = isCurrent(item, page.url.pathname)}
			<a
				href={item.href}
				data-slot="button"
				data-current={current ? "true" : undefined}
				aria-current={current ? "page" : undefined}
				class={cn(
					buttonVariants({ variant: "ghost" }),
					"justify-start gap-2",
					current && "bg-muted text-foreground",
				)}
			>
				<Icon aria-hidden="true" />
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>
	<div class={cn("mt-auto border-t p-3")}>
		<span class={cn("text-xs text-muted-foreground")}
			>{activeProjectId ?? "—"}</span
		>
	</div>
</aside>
