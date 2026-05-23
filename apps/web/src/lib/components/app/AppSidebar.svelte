<script lang="ts">
	import { page } from "$app/state";
	import type { Component } from "svelte";

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

	// Iconography: @lucide/svelte is the project's iconkit. Every sidebar entry
	// renders a lucide component instead of an ad-hoc Unicode glyph so the
	// visual identity stays consistent with the rest of the lucide-driven UI.
	import Activity from "@lucide/svelte/icons/activity";
	import BookOpen from "@lucide/svelte/icons/book-open";
	import Calendar from "@lucide/svelte/icons/calendar";
	import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Clock from "@lucide/svelte/icons/clock";
	import FileSearch from "@lucide/svelte/icons/file-search";
	import FileText from "@lucide/svelte/icons/file-text";
	import Files from "@lucide/svelte/icons/files";
	import FlaskConical from "@lucide/svelte/icons/flask-conical";
	import Folder from "@lucide/svelte/icons/folder";
	import GanttChart from "@lucide/svelte/icons/gantt-chart";
	import Inbox from "@lucide/svelte/icons/inbox";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import Layers from "@lucide/svelte/icons/layers";
	import LineChart from "@lucide/svelte/icons/line-chart";
	import ListChecks from "@lucide/svelte/icons/list-checks";
	import MessageCircle from "@lucide/svelte/icons/message-circle";
	import Network from "@lucide/svelte/icons/network";
	import Package from "@lucide/svelte/icons/package";
	import Play from "@lucide/svelte/icons/play";
	import Plug from "@lucide/svelte/icons/plug";
	import Search from "@lucide/svelte/icons/search";
	import Server from "@lucide/svelte/icons/server";
	import Settings from "@lucide/svelte/icons/settings";
	import Stethoscope from "@lucide/svelte/icons/stethoscope";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

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

	// Substage icon map. Keyed by substage `id` (which embeds the parent stage
	// like `plan-sessions`). Each entry is a lucide-svelte Component the
	// StageRail renders as a real SVG.
	const SUBSTAGE_ICON: Record<string, Component> = {
		"capture-inbox": Inbox as unknown as Component,
		"capture-docs": Files as unknown as Component,
		"plan-sessions": Clock as unknown as Component,
		"plan-missions": Layers as unknown as Component,
		"plan-reviews": ListChecks as unknown as Component,
		"plan-prototypes": FlaskConical as unknown as Component,
		"plan-templates": LayoutGrid as unknown as Component,
		"plan-prompts": MessageCircle as unknown as Component,
		"build-board": LayoutGrid as unknown as Component,
		"build-graph": Network as unknown as Component,
		"build-runs": Play as unknown as Component,
		"build-timeline": GanttChart as unknown as Component,
		"review-queue": ChevronRight as unknown as Component,
		"review-search": FileSearch as unknown as Component,
		"review-comments": MessageCircle as unknown as Component,
		"review-templates": LayoutGrid as unknown as Component,
		"ship-artifacts": Package as unknown as Component,
		"ship-archive": Files as unknown as Component,
		"operate-doctor": Stethoscope as unknown as Component,
		"operate-alerts": TriangleAlert as unknown as Component,
		"operate-audit": CheckCircle2 as unknown as Component,
		"operate-telemetry": LineChart as unknown as Component,
	};
	function iconForSubstage(id: string): Component | undefined {
		return SUBSTAGE_ICON[id];
	}

	const substages = $derived(
		subnavForStageScope(activeStage, effectiveWorkspace, effectiveProjectId).map((item) => ({
			id: item.id,
			label: item.label,
			href: item.href,
			count: item.count,
			icon: iconForSubstage(item.id),
		})),
	);

	// Map nav-data's `iconName` (the canonical name in nav-data.ts) to the real
	// lucide-svelte Component. Keeps the iconkit centralised and avoids stale
	// emoji/Unicode fallbacks.
	const COMPONENT_BY_ICON_NAME: Record<string, Component> = {
		Folder: Folder as unknown as Component,
		Search: Search as unknown as Component,
		FileText: FileText as unknown as Component,
		Settings: Settings as unknown as Component,
		BookOpen: BookOpen as unknown as Component,
		Server: Server as unknown as Component,
		Plug: Plug as unknown as Component,
		Activity: Activity as unknown as Component,
		Calendar: Calendar as unknown as Component,
	};
	function iconFor(iconName: string | undefined): Component | undefined {
		return iconName ? COMPONENT_BY_ICON_NAME[iconName] : undefined;
	}

	const workspace = WORKSPACE_NAV_ITEMS.map((item) => ({
		id: item.id,
		label: item.label,
		href: item.href,
		icon: iconFor(item.iconName),
	}));

	const system = $derived(
		SYSTEM_NAV_ITEMS.map((item) => ({
			id: item.id,
			label: item.label,
			icon: iconFor(item.iconName),
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
