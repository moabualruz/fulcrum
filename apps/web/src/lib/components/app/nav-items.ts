import type { Component } from "svelte";

import Activity from "@lucide/svelte/icons/activity";
import BookOpen from "@lucide/svelte/icons/book-open";
import FileText from "@lucide/svelte/icons/file-text";
import Folder from "@lucide/svelte/icons/folder";
import Plug from "@lucide/svelte/icons/plug";
import Search from "@lucide/svelte/icons/search";
import Server from "@lucide/svelte/icons/server";
import Settings from "@lucide/svelte/icons/settings";

export {
	NAV_GROUPS,
	NAV_ITEMS,
	STAGE_NAV_ITEMS,
	STAGE_SUBNAV,
	SYSTEM_NAV_ITEMS,
	WORKSPACE_NAV_ITEMS,
	stageForPath,
	stageNavItemsForScope,
	subnavForStage,
	subnavForStageScope,
	type LucideIconName,
	type NavGroup,
	type NavItem,
	type StageNavItem,
	type WorkflowStage,
} from "./nav-data.ts";

// Co-located lookup so tests can snapshot the icon surface without dragging
// every Svelte component into the suite. Keys MUST match `NavItem.iconName`.
export const LUCIDE_ICONS = {
	Activity,
	BookOpen,
	FileText,
	Folder,
	Plug,
	Search,
	Server,
	Settings,
} as const satisfies Record<string, Component>;
