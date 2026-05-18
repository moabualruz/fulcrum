<script lang="ts">
	import type { Command as CommandPrimitive, Dialog as DialogPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";
	import Command from "./command.svelte";
	import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent } from "@fulcrum/ui-kit";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(""),
		title = "Command Palette",
		description = "Search for a command to run...",
		showCloseButton = false,
		portalProps,
		children,
		class: className,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.RootProps> &
		WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
			portalProps?: DialogPrimitive.PortalProps;
			children: Snippet;
			title?: string;
			description?: string;
			showCloseButton?: boolean;
			class?: string;
		} = $props();
</script>

<Dialog bind:open {...restProps}>
	<DialogHeader class="sr-only">
		<DialogTitle>{title}</DialogTitle>
		<DialogDescription>{description}</DialogDescription>
	</DialogHeader>
	<DialogContent
		class={cn("rounded-xl! top-1/3 translate-y-0 overflow-hidden p-0", className)}
		{showCloseButton}
		{portalProps}
	>
		<Command {...restProps} bind:value bind:ref {children} />
	</DialogContent>
</Dialog>
