<script lang="ts">
	import Sun from "@lucide/svelte/icons/sun";
	import Cpu from "@lucide/svelte/icons/cpu";

	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	export type InferenceStatus = "healthy" | "degraded" | "unreachable" | "unknown";
	export type DensityMode = "default" | "advanced";

	interface Props {
		pathname: string;
		activeProjectId: string | null;
		onThemeToggle?: () => void;
		densityMode?: DensityMode;
		onDensityModeChange?: (mode: DensityMode) => void;
		inferenceStatus?: InferenceStatus;
		bellCount?: number;
		bellItems?: Array<{ id: string; kind: string; title: string }>;
	}

	let {
		pathname,
		activeProjectId,
		onThemeToggle = () => {},
		densityMode = "default",
		onDensityModeChange = () => {},
		inferenceStatus = "unknown",
		bellCount = 0,
		bellItems = [],
	}: Props = $props();

	function badgeColor(s: InferenceStatus): string {
		if (s === "healthy") return "text-green-500";
		if (s === "degraded") return "text-yellow-500";
		if (s === "unreachable") return "text-red-500";
		return "text-muted-foreground";
	}

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
	let scopeLabel = $derived(activeProjectId ?? "All projects");
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
		<span
			data-scope-indicator
			class={cn("inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-muted-foreground")}
		>{scopeLabel}</span>
		<div
			data-density-switch
			data-density-mode={densityMode}
			class={cn("inline-flex h-8 overflow-hidden rounded-md border border-border")}
			aria-label="density mode"
		>
			<button
				type="button"
				aria-label="default density"
				aria-pressed={densityMode === "default"}
				onclick={() => onDensityModeChange("default")}
				class={cn("px-2 text-xs", densityMode === "default" && "bg-muted text-foreground")}
			>Default</button>
			<button
				type="button"
				aria-label="advanced density"
				aria-pressed={densityMode === "advanced"}
				onclick={() => onDensityModeChange("advanced")}
				class={cn("px-2 text-xs", densityMode === "advanced" && "bg-muted text-foreground")}
			>Advanced</button>
		</div>
		<span
			data-inference-badge
			data-inference-status={inferenceStatus}
			aria-label="inference backend status: {inferenceStatus}"
			class={cn("inline-flex items-center gap-1 text-xs", badgeColor(inferenceStatus))}
		>
			<Cpu class="h-4 w-4" aria-hidden="true" />
			<span class="hidden sm:inline capitalize">{inferenceStatus}</span>
		</span>
		<kbd
			class={cn(
				"hidden h-6 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs sm:inline-flex",
			)}
			aria-label="open command palette">⌘K</kbd
		>
		<button
			type="button"
			data-notification-bell
			aria-label="notifications"
			class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
		>
			<span aria-hidden="true">!</span>
			{#if bellCount > 0}
				<span
					data-notification-badge
					class={cn("absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground")}
				>{bellCount}</span>
			{/if}
		</button>
		{#if bellItems.length > 0}
			<div data-notification-menu class={cn("sr-only")}>
				{#each bellItems.slice(0, 5) as item (item.id)}
					<div>{item.title}</div>
				{/each}
				<a href="/inbox">See all</a>
			</div>
		{/if}
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
		<span
			class={cn("text-xs text-muted-foreground")}
			data-active-project>{activeProjectId ?? "—"}</span
		>
	</div>
</header>
