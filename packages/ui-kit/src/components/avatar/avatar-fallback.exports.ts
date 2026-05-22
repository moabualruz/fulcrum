import type { Avatar as AvatarPrimitive, WithoutChildrenOrChild } from "bits-ui";
import { cn } from "../../utils.js";

export type AvatarFallbackProps = WithoutChildrenOrChild<AvatarPrimitive.FallbackProps> & {
	children?: import("svelte").Snippet;
};
