<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import CircleHelp from "@lucide/svelte/icons/circle-help";
	import Search from "@lucide/svelte/icons/search";
	import Settings2 from "@lucide/svelte/icons/settings-2";
	import UserCircle from "@lucide/svelte/icons/user-circle";

	import { ScopeBar, TraceChip, type WorkflowStage } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	export type InferenceStatus = "healthy" | "degraded" | "unreachable" | "unknown";
	export type DensityMode = "compact" | "cozy" | "comfortable";

	interface Props {
		pathname: string;
		activeProjectId: string | null;
		onThemeToggle?: () => void;
		densityMode?: DensityMode;
		onDensityModeChange?: (mode: DensityMode) => void;
		inferenceStatus?: InferenceStatus;
		traceId?: string | null;
		bellCount?: number;
		bellItems?: Array<{ id: string; kind: string; title: string }>;
	}

	let {
		pathname,
		activeProjectId,
		onThemeToggle = () => {},
		densityMode = "cozy",
		onDensityModeChange = () => {},
		inferenceStatus = "unknown",
		traceId = null,
		bellCount = 0,
		bellItems = [],
	}: Props = $props();

	const densityModes: Array<{ id: DensityMode; label: string }> = [
		{ id: "compact", label: "Compact" },
		{ id: "cozy", label: "Cozy" },
		{ id: "comfortable", label: "Comfortable" },
	];

	const stageOrder: WorkflowStage[] = ["capture", "plan", "build", "review", "ship", "operate"];

	function stageForPath(path: string): WorkflowStage {
		const lower = path.toLowerCase();
		for (const stage of stageOrder) {
			if (lower === `/${stage}` || lower.includes(`/${stage}/`) || lower.endsWith(`/${stage}`)) {
				return stage;
			}
		}
		if (lower.includes("/planning") || lower.includes("/plan-")) return "plan";
		if (lower.includes("/build") || lower.includes("/boards") || lower.includes("/runs")) return "build";
		if (lower.includes("/review")) return "review";
		if (lower.includes("/ship")) return "ship";
		if (lower.includes("/operate") || lower.includes("/settings")) return "operate";
		return "capture";
	}

	function stageHref(stage: WorkflowStage): string {
		if (activeProjectId) return `/projects/${activeProjectId}/${stage}`;
		return `/${stage}`;
	}

	function selectStage(stage: WorkflowStage) {
		if (typeof window !== "undefined") {
			window.location.href = stageHref(stage);
		}
	}

	const activeStage = $derived(stageForPath(pathname));
	const workspacePath = $derived(`mkh / ${activeProjectId ?? "all-projects"}`);
	const notificationLabel = $derived(`Notifications · ${bellCount} unread`);
	const traceBadgeId = $derived(traceId ?? "4f3a1c9e2b7d8a6c");
	const iconButtonClass = cn(
		"grid size-7 place-items-center rounded-md text-fg-subtle transition-colors",
		"hover:bg-surface-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
	);
</script>

<ScopeBar
	data-app-topbar
	brand="Fulcrum"
	workspacePath={workspacePath}
	activeStage={activeStage}
	onSelectStage={selectStage}
>
		{#snippet trace()}
			<TraceChip
				badge
				traceId={traceBadgeId}
				project={activeProjectId ?? "all-projects"}
				timestamp="current request"
			/>
		{/snippet}
		{#snippet systemCluster()}
		<div
			data-density-switch
			data-density-mode={densityMode}
			class={cn("hidden h-7 overflow-hidden rounded-md border border-border lg:inline-flex")}
			aria-label="density mode"
		>
			{#each densityModes as mode (mode.id)}
				<button
					type="button"
					aria-label="{mode.label} density"
					aria-pressed={densityMode === mode.id}
					data-density-option={mode.id}
					onclick={() => onDensityModeChange(mode.id)}
					class={cn(
						"px-2 text-xs text-fg-subtle",
						densityMode === mode.id && "bg-surface-sunken text-fg",
					)}
				>{mode.label}</button>
			{/each}
		</div>
		<button
			type="button"
			aria-label="Command palette · ⌘K"
			aria-expanded="false"
			data-scope-system-icon="command-palette"
			class={iconButtonClass}
		>
			<Search class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			data-notification-bell
			aria-label={notificationLabel}
			aria-expanded={bellItems.length > 0 ? "true" : "false"}
			data-scope-system-icon="notifications"
			class={cn(iconButtonClass, "relative")}
		>
			<Bell class="size-4" aria-hidden="true" />
			{#if bellCount > 0}
				<span
					data-notification-badge
					class={cn("absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[10px] text-primary-foreground")}
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
			aria-label="Display, density, mode, theme"
			aria-expanded="false"
			data-scope-system-icon="display"
			onclick={onThemeToggle}
			class={iconButtonClass}
		>
			<Settings2 class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			aria-label="Keyboard shortcuts · ?"
			aria-expanded="false"
			data-scope-system-icon="keyboard-help"
			class={iconButtonClass}
		>
			<CircleHelp class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			aria-label="Account · sign out, switch workspace"
			aria-expanded="false"
			data-scope-system-icon="account"
			class={iconButtonClass}
		>
			<UserCircle class="size-4" aria-hidden="true" />
		</button>
		<span data-inference-status={inferenceStatus} class="sr-only">
			Inference backend status: {inferenceStatus}
		</span>
		{/snippet}
</ScopeBar>
