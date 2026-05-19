<script lang="ts" module>
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type CredentialInputProps = WithElementRef<
		Omit<HTMLInputAttributes, "type"> & {
			/** When true, the value is masked again after the input loses focus. Default true. */
			maskOnBlur?: boolean;
			/** Initial visible state for the show/hide toggle. Default false (masked). */
			defaultVisible?: boolean;
			/** Accessible label applied to the show/hide toggle. */
			toggleLabel?: { show: string; hide: string };
		},
		HTMLInputElement
	>;
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		value = $bindable(""),
		class: className,
		"data-slot": dataSlot = "credential-input",
		maskOnBlur = true,
		defaultVisible = false,
		toggleLabel = { show: "Show value", hide: "Hide value" },
		"aria-invalid": ariaInvalid,
		autocomplete = "new-password",
		...restProps
	}: CredentialInputProps = $props();

	let visible = $state(defaultVisible);

	function toggle() {
		visible = !visible;
	}

	function handleBlur(event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		if (maskOnBlur) visible = false;
		// preserve consumer onblur if provided via restProps
		const cb = (restProps as Record<string, unknown>).onblur as
			| ((e: FocusEvent) => void)
			| undefined;
		cb?.(event);
	}
</script>

<div
	class={cn("relative inline-flex w-full items-center", className)}
	data-slot={`${dataSlot}-root`}
	data-visible={visible ? "true" : "false"}
>
	<input
		bind:this={ref}
		data-slot={dataSlot}
		data-visible={visible ? "true" : "false"}
		type={visible ? "text" : "password"}
		bind:value
		aria-invalid={ariaInvalid}
		{autocomplete}
		spellcheck={false}
		autocapitalize="off"
		autocorrect="off"
		class={cn(
			"dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
			"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
			"aria-invalid:border-destructive dark:aria-invalid:border-destructive/50",
			"h-9 w-full min-w-0 rounded-md border bg-transparent pl-2.5 pr-10 py-1",
			"text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-3 aria-invalid:ring-3",
			"placeholder:text-muted-foreground outline-none md:text-sm",
			"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			"font-mono tracking-wider",
		)}
		onblur={handleBlur}
		{...restProps}
	/>
	<button
		type="button"
		data-slot={`${dataSlot}-toggle`}
		data-visible={visible ? "true" : "false"}
		aria-pressed={visible}
		aria-label={visible ? toggleLabel.hide : toggleLabel.show}
		onclick={toggle}
		class={cn(
			"absolute right-1 top-1/2 -translate-y-1/2",
			"inline-flex h-7 w-7 items-center justify-center rounded-sm",
			"text-muted-foreground hover:text-foreground",
			"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
			"disabled:pointer-events-none disabled:opacity-50",
		)}
		tabindex={0}
	>
		{#if visible}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
				<path
					d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
				/>
				<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
				<line x1="2" x2="22" y1="2" y2="22" />
			</svg>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		{/if}
	</button>
</div>
