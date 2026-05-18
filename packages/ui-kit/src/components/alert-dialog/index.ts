import Root from "./alert-dialog.svelte";
import Trigger from "./alert-dialog-trigger.svelte";
import Content from "./alert-dialog-content.svelte";
import Title from "./alert-dialog-title.svelte";
import Description from "./alert-dialog-description.svelte";
import Action from "./alert-dialog-action.svelte";
import Cancel from "./alert-dialog-cancel.svelte";

export type { AlertDialogProps } from "./alert-dialog.svelte";
export type { AlertDialogTriggerProps } from "./alert-dialog-trigger.svelte";
export type { AlertDialogContentProps } from "./alert-dialog-content.svelte";
export type { AlertDialogTitleProps } from "./alert-dialog-title.svelte";
export type { AlertDialogDescriptionProps } from "./alert-dialog-description.svelte";
export type { AlertDialogActionProps } from "./alert-dialog-action.svelte";
export type { AlertDialogCancelProps } from "./alert-dialog-cancel.svelte";

export {
	Root,
	Trigger,
	Content,
	Title,
	Description,
	Action,
	Cancel,
	//
	Root as AlertDialog,
	Trigger as AlertDialogTrigger,
	Content as AlertDialogContent,
	Title as AlertDialogTitle,
	Description as AlertDialogDescription,
	Action as AlertDialogAction,
	Cancel as AlertDialogCancel,
};
