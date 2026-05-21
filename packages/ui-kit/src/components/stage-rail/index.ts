import Root from "./stage-rail.svelte";
import MobileStageTabs from "./mobile-stage-tabs.svelte";

export type {
	MobileStageTabItem,
	MobileStageTabsProps,
} from "./mobile-stage-tabs.svelte";

export type {
	StageRailProps,
	StageRailItem,
	StageRailSubnavItem,
	StageRailSystemItem,
	StageRailWorkspaceItem,
	WorkflowStage,
} from "./stage-rail.svelte";
export { WORKFLOW_STAGES } from "./stage-rail.svelte";
export {
	Root,
	MobileStageTabs,
	//
	Root as StageRail,
};
