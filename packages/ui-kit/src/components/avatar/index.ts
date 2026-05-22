import Root from "./avatar.svelte";
import Image from "./avatar-image.svelte";
import Fallback from "./avatar-fallback.svelte";

export type {
	AvatarProps,
	AvatarSize,
} from "./avatar.exports.js";
export type { AvatarImageProps } from "./avatar-image.exports.js";
export type { AvatarFallbackProps } from "./avatar-fallback.exports.js";
export { avatarVariants } from "./avatar.exports.js";

export {
	Root,
	Image,
	Fallback,
	//
	Root as Avatar,
	Image as AvatarImage,
	Fallback as AvatarFallback,
};
