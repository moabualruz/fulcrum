<script lang="ts" module>
	import type { Switch as SwitchPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type SwitchProps = WithoutChildrenOrChild<SwitchPrimitive.RootProps>;
</script>

<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: SwitchProps = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		"peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors",
		"bg-muted",
		"data-[state=checked]:bg-primary",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
		"disabled:cursor-not-allowed disabled:opacity-50",
		"aria-invalid:ring-destructive/40 aria-invalid:ring-2",
		className,
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class={cn(
			"pointer-events-none block size-4 rounded-full bg-background shadow ring-0 transition-transform",
			"data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
		)}
	/>
</SwitchPrimitive.Root>
