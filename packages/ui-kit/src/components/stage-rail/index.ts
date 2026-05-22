import Root from "./stage-rail.svelte";
import MobileStageTabs from "./mobile-stage-tabs.svelte";

export type {
	MobileStageTabItem,
	MobileStageTabsProps,
} from "./mobile-stage-tabs.exports.js";

export type {
	StageRailProps,
	StageRailItem,
	StageRailSubnavItem,
	StageRailSystemItem,
	StageRailWorkspaceItem,
	WorkflowStage,
} from "./stage-rail.exports.js";
export { WORKFLOW_STAGES } from "./stage-rail.exports.js";
export {
	Root,
	MobileStageTabs,
	//
	Root as StageRail,
};
