export type TimelineLane = {
	id: string;
	title: string;
	icon: string;
	status: "running" | "complete" | "awaiting" | "blocked";
	startDate: string;
	endDate: string;
	progress?: number;
};

export type BuildTimelineData = {
	timeline: {
		cycle: string;
		windowStart: string;
		today: string;
		daysVisible: number;
		isEmpty: boolean;
		lanes: TimelineLane[];
	};
};

export function buildTimelineFixtureData(empty = false): BuildTimelineData {
	const lanes: TimelineLane[] = [
		{ id: "FUL-1284", title: "Persist issuance row per kid", icon: "git-pull-request", status: "running", startDate: "2026-05-18", endDate: "2026-05-24", progress: 65 },
		{ id: "FUL-1261", title: "Stage route grammar wrappers", icon: "radio", status: "complete", startDate: "2026-05-15", endDate: "2026-05-21" },
		{ id: "FUL-1274", title: "Review queue fidelity", icon: "activity", status: "complete", startDate: "2026-05-16", endDate: "2026-05-20" },
		{ id: "FUL-1290", title: "Build board optimistic create", icon: "grid", status: "awaiting", startDate: "2026-05-22", endDate: "2026-05-27" },
		{ id: "FUL-1292", title: "Agent run export", icon: "workflow", status: "blocked", startDate: "2026-05-19", endDate: "2026-05-26" },
		{ id: "FUL-1301", title: "Terminal transcript replay", icon: "terminal", status: "running", startDate: "2026-05-20", endDate: "2026-05-29", progress: 40 },
		{ id: "FUL-1304", title: "Comment digest", icon: "message-circle", status: "awaiting", startDate: "2026-05-23", endDate: "2026-05-30" },
		{ id: "FUL-1310", title: "Knowledge backlinks", icon: "book", status: "running", startDate: "2026-05-21", endDate: "2026-05-31", progress: 20 },
	];

	return {
		timeline: {
			cycle: "cycle 24w13",
			windowStart: "2026-05-14",
			today: "2026-05-21",
			daysVisible: 14,
			isEmpty: empty,
			lanes: empty ? [] : lanes,
		},
	};
}
