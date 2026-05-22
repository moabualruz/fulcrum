import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";
import type { WorkflowStage } from "./stage-rail.exports.js";

export type MobileStageTabItem = {
	stage: WorkflowStage;
	label: string;
	href: string;
};

export type MobileStageTabsProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	items: readonly MobileStageTabItem[];
	current?: WorkflowStage;
	aiAssistOpen?: boolean;
	onNavigate?: (stage: WorkflowStage, href: string) => void;
	onAiAssist?: () => void;
};

const STAGE_GLYPH: Record<WorkflowStage, string> = {
	capture: "C",
	plan: "P",
	build: "B",
	review: "R",
	ship: "S",
	operate: "O",
};

const STAGE_LABEL: Record<WorkflowStage, string> = {
	capture: "Capture",
	plan: "Plan",
	build: "Build",
	review: "Review",
	ship: "Ship",
	operate: "Operate",
};
