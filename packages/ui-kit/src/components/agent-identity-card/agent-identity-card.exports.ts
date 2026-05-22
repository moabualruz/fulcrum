import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type AgentCapability = "code" | "browse" | "shell" | "edit" | "review" | "plan";

export type AgentIdentityCardProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	name: string;
	provider: string;
	model: string;
	tokenBudget?: number;
	tokensUsed?: number;
	capabilities?: AgentCapability[];
	costPerCall?: string;
	avatarInitials?: string;
};
