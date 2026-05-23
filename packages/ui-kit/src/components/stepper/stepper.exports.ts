import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type StepperStep = {
	id: string;
	label: string;
	description?: string;
};

export type StepperProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	steps: StepperStep[];
	currentStep: number;
	orientation?: "horizontal" | "vertical";
};
