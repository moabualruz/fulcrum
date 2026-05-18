<script lang="ts" module>
	import type { Combobox as ComboboxPrimitive } from "bits-ui";

	export type ComboboxProps = ComboboxPrimitive.RootProps;
</script>

<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	let {
		value = $bindable(),
		open = $bindable(false),
		inputValue = $bindable(""),
		children,
		...restProps
	}: ComboboxProps = $props();
</script>

<ComboboxPrimitive.Root
	bind:value
	bind:open
	bind:inputValue
	data-slot="combobox"
	{...restProps}
>
	{@render children?.()}
</ComboboxPrimitive.Root>
