<script lang="ts">
	import { page } from "$app/state";

	import { StageRail } from "@fulcrum/ui-kit";
	import { STAGE_WORKBENCH_ROUTE, stageRoute, type WorkflowStage } from "$lib/components/app/route-map.ts";
	import { cn } from "$lib/utils.js";

	import {
		SYSTEM_NAV_ITEMS,
		WORKSPACE_NAV_ITEMS,
		stageForPath,
		subnavForStage,
	} from "./nav-items.ts";

	interface Props {
		activeProjectId: string | null;
	}

	let { activeProjectId }: Props = $props();

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

	function stageWorkbenchHref(stage: WorkflowStage): string {
		const projectId = activeProjectId ?? projectFromPath(page.url.pathname);
		if (projectId) return stageRoute(workspaceFromPath(page.url.pathname), projectId, stage);
		return STAGE_WORKBENCH_ROUTE[stage];
	}

	// AppSidebar is a thin data-supplying consumer of the `@fulcrum/ui-kit`
	// StageRail primitive — it owns no rail markup of its own.
	//
	// Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the six-stage
	// Capture→Operate workflow axis is the ScopeBar tab strip's, NOT the rail's.
	// The rail renders the *active stage's sub-navigation* plus the persistent
	// Workspace (Portfolio) and System groups — the OD `desktop-shell.html` rail
	// replica. `stageForPath` resolves the live route to a WorkflowStage so the
	// rail picks the right sub-nav; that route↔stage mapping stays available as
	// data (`STAGE_NAV_ITEMS`, `stageForPath`) for the ScopeBar to consume.
	// Collapse is fixed expanded here; the 56px collapsed rail is owned by the
	// responsive shell PRD.
	const activeStage = $derived(stageForPath(page.url.pathname));
	const effectiveProjectId = $derived(activeProjectId ?? projectFromPath(page.url.pathname));

	const substages = $derived(
		subnavForStage(activeStage).map((item, index) => ({
			id: item.id,
			label: item.label,
			href: index === 0 ? stageWorkbenchHref(activeStage) : item.href,
			count: item.count,
		})),
	);

	const workspace = WORKSPACE_NAV_ITEMS.map((item) => ({
		id: item.id,
		label: item.label,
		href: item.href,
	}));

	const system = SYSTEM_NAV_ITEMS.map((item) => ({
		id: item.id,
		label: item.label,
		href: item.href,
	}));
</script>

<aside aria-label="primary navigation" class={cn("flex h-full flex-col")}>
	<StageRail
		current={activeStage}
		collapsed={false}
		{substages}
		{workspace}
		{system}
		ariaLabel="Stage navigation"
		class="flex-1"
	/>
	<div class={cn("border-r border-t border-border bg-surface-sunken p-3")}>
		<span class={cn("text-xs text-fg-muted")}>{effectiveProjectId ?? "—"}</span>
	</div>
</aside>
