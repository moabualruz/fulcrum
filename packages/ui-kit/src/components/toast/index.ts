import Region from "./toast-region.svelte";

export type { ToastRegionProps } from "./toast-region.svelte";
export {
	ToastStore,
	defaultToastStore,
	type ToastItem,
	type ToastInput,
	type ToastTone,
} from "./toast-store.svelte.js";

export {
	Region,
	//
	Region as ToastRegion,
};
