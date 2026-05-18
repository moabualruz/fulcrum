import "@fulcrum/ui-kit/styles/tokens.css";

import Root from "./avatar.svelte";
import Image from "./avatar-image.svelte";
import Fallback from "./avatar-fallback.svelte";

export type {
	AvatarProps,
	AvatarSize,
} from "./avatar.svelte";
export type { AvatarImageProps } from "./avatar-image.svelte";
export type { AvatarFallbackProps } from "./avatar-fallback.svelte";
export { avatarVariants } from "./avatar.svelte";

export {
	Root,
	Image,
	Fallback,
	//
	Root as Avatar,
	Image as AvatarImage,
	Fallback as AvatarFallback,
};
