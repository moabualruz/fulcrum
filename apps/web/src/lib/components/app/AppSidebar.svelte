<script lang="ts">
	import { page } from "$app/state";

	import { StageRail } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	import { STAGE_NAV_ITEMS, SYSTEM_NAV_ITEMS, WORKSPACE_NAV_ITEMS, stageForPath } from "./nav-items.ts";

	interface Props {
		activeProjectId: string | null;
	}

	let { activeProjectId }: Props = $props();

	// AppSidebar is a thin data-supplying consumer of the `@fulcrum/ui-kit`
	// StageRail primitive — it owns no rail markup of its own. It maps the live
	// route to a WorkflowStage and hands the primitive the three groups:
	// the six WorkflowStages, the persistent Workspace (Portfolio) group, and
	// the System group. Collapse is fixed expanded here; the 56px collapsed
	// rail is owned by the responsive shell PRD.
	const activeStage = $derived(stageForPath(page.url.pathname));

	const stages = STAGE_NAV_ITEMS.map((item) => ({ stage: item.stage, href: item.href }));

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
		{stages}
		{workspace}
		{system}
		ariaLabel="Workflow stages"
		class="flex-1"
	/>
	<div class={cn("border-r border-t border-border bg-surface-sunken p-3")}>
		<span class={cn("text-xs text-fg-muted")}>{activeProjectId ?? "—"}</span>
	</div>
</aside>
