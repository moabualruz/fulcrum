<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import CircleHelp from "@lucide/svelte/icons/circle-help";
	import Search from "@lucide/svelte/icons/search";
	import Settings2 from "@lucide/svelte/icons/settings-2";
	import UserCircle from "@lucide/svelte/icons/user-circle";

	import { ScopeBar, TraceChip, type WorkflowStage } from "@fulcrum/ui-kit";
	import { STAGE_WORKBENCH_ROUTE, stageRoute, withTrace } from "$lib/components/app/route-map.ts";
	import { cn } from "$lib/utils.js";

	export type InferenceStatus = "healthy" | "degraded" | "unreachable" | "unknown";
	export type DensityMode = "compact" | "cozy" | "comfortable";
	type SystemPanel = "notifications" | "display" | "keyboard-help" | "account";

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
			if (lower.match(new RegExp(`^/[^/]+/projects/[^/]+/${stage}(?:/|$)`))) return stage;
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

	function workspaceFromPath(path: string): string {
		const parts = path.split("/").filter(Boolean);
		return parts[1] === "projects" ? (parts[0] ?? "mkh") : "mkh";
	}

	function projectFromPath(path: string): string | null {
		const parts = path.split("/").filter(Boolean);
		const projectIndex = parts.indexOf("projects");
		if (projectIndex < 0) return null;
		return parts[projectIndex + 1] ?? null;
	}

	function stageHref(stage: WorkflowStage): string {
		const projectId = activeProjectId ?? projectFromPath(pathname);
		if (projectId) return stageRoute(workspaceFromPath(pathname), projectId, stage);
		return STAGE_WORKBENCH_ROUTE[stage];
	}

	function selectStage(stage: WorkflowStage) {
		if (typeof window !== "undefined") {
			window.location.href = withTrace(stageHref(stage), window.location);
		}
	}

	const activeStage = $derived(stageForPath(pathname));
	const effectiveProjectId = $derived(activeProjectId ?? projectFromPath(pathname));
	const workspacePath = $derived(`${workspaceFromPath(pathname)} / ${effectiveProjectId ?? "all-projects"}`);
	const notificationLabel = $derived(`Notifications · ${bellCount} unread`);
	const traceBadgeId = $derived(traceId ?? "4f3a1c9e2b7d8a6c");
	let openSystemPanel = $state<SystemPanel | null>(null);
	const iconButtonClass = cn(
		"grid size-7 place-items-center rounded-md text-fg-subtle transition-colors",
		"hover:bg-surface-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
	);
	const panelClass = cn(
		"absolute right-0 top-9 z-30 w-64 rounded-md border border-border bg-surface-elevated p-3 text-xs text-fg shadow-lg",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
	);

	function toggleSystemPanel(panel: SystemPanel) {
		openSystemPanel = openSystemPanel === panel ? null : panel;
	}

	function isSystemPanelOpen(panel: SystemPanel) {
		return openSystemPanel === panel;
	}

	function openCommandPalette(): void {
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("fulcrum:open-command-palette"));
		}
	}
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
				project={effectiveProjectId ?? "all-projects"}
				timestamp="current request"
			/>
		{/snippet}
		{#snippet systemCluster()}
		<div class="relative flex items-center gap-1">
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
			aria-haspopup="dialog"
			data-scope-system-icon="command-palette"
			onclick={openCommandPalette}
			class={iconButtonClass}
		>
			<Search class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			data-notification-bell
			aria-label={notificationLabel}
			aria-expanded={isSystemPanelOpen("notifications") ? "true" : "false"}
			aria-controls="scope-system-panel-notifications"
			data-open={isSystemPanelOpen("notifications") ? "true" : "false"}
			data-scope-system-icon="notifications"
			onclick={() => toggleSystemPanel("notifications")}
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
		<div
			id="scope-system-panel-notifications"
			data-notification-menu
			data-scope-system-panel="notifications"
			data-open={isSystemPanelOpen("notifications") ? "true" : "false"}
			class={isSystemPanelOpen("notifications") ? panelClass : "sr-only"}
			hidden={!isSystemPanelOpen("notifications")}
		>
			{#if bellItems.length > 0}
				{#each bellItems.slice(0, 5) as item (item.id)}
					<div>{item.title}</div>
				{/each}
				<a href="/inbox">See all</a>
			{:else}
				<div>No unread notifications</div>
			{/if}
		</div>
		<button
			type="button"
			aria-label="Display, density, mode, theme"
			aria-expanded={isSystemPanelOpen("display") ? "true" : "false"}
			aria-controls="scope-system-panel-display"
			data-open={isSystemPanelOpen("display") ? "true" : "false"}
			data-scope-system-icon="display"
			onclick={() => toggleSystemPanel("display")}
			class={iconButtonClass}
		>
			<Settings2 class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			aria-label="Keyboard shortcuts · ?"
			aria-expanded={isSystemPanelOpen("keyboard-help") ? "true" : "false"}
			aria-controls="scope-system-panel-keyboard-help"
			data-open={isSystemPanelOpen("keyboard-help") ? "true" : "false"}
			data-scope-system-icon="keyboard-help"
			onclick={() => toggleSystemPanel("keyboard-help")}
			class={iconButtonClass}
		>
			<CircleHelp class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			aria-label="Account · sign out, switch workspace"
			aria-expanded={isSystemPanelOpen("account") ? "true" : "false"}
			aria-controls="scope-system-panel-account"
			data-open={isSystemPanelOpen("account") ? "true" : "false"}
			data-scope-system-icon="account"
			onclick={() => toggleSystemPanel("account")}
			class={iconButtonClass}
		>
			<UserCircle class="size-4" aria-hidden="true" />
		</button>
		{#if isSystemPanelOpen("display")}
			<div id="scope-system-panel-display" data-scope-system-panel="display" data-open="true" class={panelClass}>
				<div class="mb-2 font-medium">Display</div>
				<div class="mb-2 flex overflow-hidden rounded-md border border-border">
					{#each densityModes as mode (mode.id)}
						<button
							type="button"
							aria-label="{mode.label} density"
							aria-pressed={densityMode === mode.id}
							data-density-option-panel={mode.id}
							onclick={() => onDensityModeChange(mode.id)}
							class={cn(
								"flex-1 px-2 py-1 text-xs text-fg-subtle",
								densityMode === mode.id && "bg-surface-sunken text-fg",
							)}
						>{mode.label}</button>
					{/each}
				</div>
				<button type="button" class={cn(iconButtonClass, "w-full justify-start px-2")} onclick={onThemeToggle}>Toggle theme</button>
			</div>
		{/if}
		{#if isSystemPanelOpen("keyboard-help")}
			<div id="scope-system-panel-keyboard-help" data-scope-system-panel="keyboard-help" data-open="true" class={panelClass}>
				Keyboard shortcuts
			</div>
		{/if}
		{#if isSystemPanelOpen("account")}
			<div id="scope-system-panel-account" data-scope-system-panel="account" data-open="true" class={panelClass}>
				Account and workspace
			</div>
		{/if}
		<span data-inference-status={inferenceStatus} class="sr-only">
			Inference backend status: {inferenceStatus}
		</span>
		</div>
		{/snippet}
</ScopeBar>
