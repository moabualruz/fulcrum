import Root from "./status-badge.svelte";

export type {
	StatusBadgeProps,
	WorkflowStatus,
	CanonicalStatus,
} from "./status-badge.exports.js";
export {
	CANONICAL_STATUS_VOCAB,
	BANNED_STATUS_SYNONYMS,
	statusLabel,
} from "./status-badge.exports.js";
export {
	Root,
	//
	Root as StatusBadge,
};
