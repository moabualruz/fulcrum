<script lang="ts">
	import Sun from "@lucide/svelte/icons/sun";

	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		pathname: string;
		activeProjectId: string | null;
	}

	let { pathname, activeProjectId }: Props = $props();

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
			class={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
		>
			<Sun aria-hidden="true" />
		</button>
		<span
			class={cn("text-xs text-muted-foreground")}
			data-active-project>{activeProjectId ?? "—"}</span
		>
	</div>
</header>
