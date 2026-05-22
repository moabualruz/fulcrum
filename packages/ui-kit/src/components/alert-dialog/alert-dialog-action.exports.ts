import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type AlertDialogActionProps = WithoutChild<AlertDialogPrimitive.ActionProps> & {
	tone?: "primary" | "destructive";
};
