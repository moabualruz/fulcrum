import type { HTMLInputAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type CredentialInputProps = WithElementRef<
	Omit<HTMLInputAttributes, "type"> & {
		/** When true, the value is masked again after the input loses focus. Default true. */
		maskOnBlur?: boolean;
		/** Initial visible state for the show/hide toggle. Default false (masked). */
		defaultVisible?: boolean;
		/** Accessible label applied to the show/hide toggle. */
		toggleLabel?: { show: string; hide: string };
	},
	HTMLInputElement
>;
