<script lang="ts">
	import { page } from "$app/state";

	import { StageRail } from "@fulcrum/ui-kit";
	import {
		DEFAULT_CANONICAL_PROJECT,
		DEFAULT_CANONICAL_WORKSPACE,
		stageSubroute,
	} from "$lib/components/app/route-map.ts";
	import { cn } from "@fulcrum/ui-kit";

	import {
		SYSTEM_NAV_ITEMS,
		WORKSPACE_NAV_ITEMS,
		stageForPath,
		subnavForStageScope,
	} from "./nav-items.ts";

	interface Props {
		activeProjectId: string | null;
		railCollapsed?: boolean;
	}

	let { activeProjectId, railCollapsed = false }: Props = $props();

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

	// AppSidebar is a thin data-supplying consumer of the `@fulcrum/ui-kit`
	// StageRail primitive: it owns no rail markup of its own.
	//
	// Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the six-stage
	// Capture→Operate workflow axis is the ScopeBar tab strip's, NOT the rail's.
	// The rail renders the *active stage's sub-navigation* plus the persistent
	// Workspace (Portfolio) and System groups: the OD `desktop-shell.html` rail
	// replica. `stageForPath` resolves the live route to a WorkflowStage so the
	// rail picks the right sub-nav; that route↔stage mapping stays available as
	// data (`STAGE_NAV_ITEMS`, `stageForPath`) for the ScopeBar to consume.
	const activeStage = $derived(stageForPath(page.url.pathname));
	const effectiveWorkspace = $derived(workspaceFromPath(page.url.pathname) || DEFAULT_CANONICAL_WORKSPACE);
	const displayProjectId = $derived(activeProjectId ?? projectFromPath(page.url.pathname));
	const effectiveProjectId = $derived(
		displayProjectId ?? DEFAULT_CANONICAL_PROJECT,
	);

	const substages = $derived(
		subnavForStageScope(activeStage, effectiveWorkspace, effectiveProjectId).map((item) => ({
			id: item.id,
			label: item.label,
			href: item.href,
			count: item.count,
		})),
	);

	const workspace = WORKSPACE_NAV_ITEMS.map((item) => ({
		id: item.id,
		label: item.label,
		href: item.href,
	}));

	const system = $derived(
		SYSTEM_NAV_ITEMS.map((item) => ({
			id: item.id,
			label: item.label,
			href:
				item.id === "mcp" || item.id === "plugins"
					? stageSubroute(effectiveWorkspace, effectiveProjectId, "operate", item.id)
					: item.href,
		})),
	);
</script>

<aside aria-label="primary navigation" class={cn("flex h-full flex-col")}>
	<StageRail
		current={activeStage}
		collapsed={railCollapsed}
		{substages}
		{workspace}
		{system}
		ariaLabel="Stage navigation"
		class="flex-1"
	/>
	<div class={cn("border-r border-t border-border bg-surface-sunken p-3")}>
		<span class={cn("text-xs text-fg-muted")}>{displayProjectId ?? "-"}</span>
	</div>
</aside>
