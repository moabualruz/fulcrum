export const LUCIDE_ICON_NAMES = [
	"Activity",
	"FileText",
	"Folder",
	"Kanban",
	"LayoutDashboard",
	"Search",
	"Settings",
] as const;

export type LucideIconName = (typeof LUCIDE_ICON_NAMES)[number];

export interface NavItem {
	/** Absolute path the link routes to (always begins with "/"). */
	href: string;
	/** Visible text rendered next to the icon. */
	label: string;
	/** Lookup key into `LUCIDE_ICONS`. */
	iconName: LucideIconName;
}

export interface NavGroup {
	label: "Current Scope" | "Portfolio" | "System";
	items: readonly NavItem[];
}

// Group order is locked by `nav-items.test.ts`; reordering is intentional and
// requires updating the test snapshot.
export const NAV_GROUPS: readonly NavGroup[] = [
	{
		label: "Current Scope",
		items: [
			{ href: "/", label: "Dashboard", iconName: "LayoutDashboard" },
			{ href: "/boards", label: "Board", iconName: "Kanban" },
			{ href: "/docs", label: "Docs", iconName: "FileText" },
			{ href: "/planning", label: "Planning", iconName: "FileText" },
			{ href: "/runs", label: "Runs", iconName: "Activity" },
			{ href: "/artifacts", label: "Artifacts", iconName: "FileText" },
		],
	},
	{
		label: "Portfolio",
		items: [
			{ href: "/projects", label: "All projects", iconName: "Folder" },
			{ href: "/search", label: "Search", iconName: "Search" },
			{ href: "/memory", label: "Memory", iconName: "FileText" },
			{ href: "/context/preview", label: "Context", iconName: "FileText" },
		],
	},
	{
		label: "System",
		items: [
			{ href: "/agents", label: "Agents", iconName: "Activity" },
			{ href: "/orchestration", label: "Orchestration", iconName: "Kanban" },
			{ href: "/audit", label: "Audit", iconName: "FileText" },
			{ href: "/doctor", label: "Doctor", iconName: "Activity" },
			{ href: "/settings/inference", label: "Settings", iconName: "Settings" },
		],
	},
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
