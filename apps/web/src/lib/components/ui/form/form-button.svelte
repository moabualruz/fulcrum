<script lang="ts">
	import { Button, type ButtonProps } from "@fulcrum/ui-kit";

	let { ref = $bindable(null), ...restProps }: ButtonProps = $props();
</script>

<Button bind:ref type="submit" {...restProps} />
