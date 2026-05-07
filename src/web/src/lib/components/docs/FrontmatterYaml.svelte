<script lang="ts">
	import type { DocType } from "../../../../../domain/docs/enums.ts";
	import { cn } from "$lib/utils.js";
	import {
		dumpFrontmatterYaml,
		parseFrontmatterYaml,
		type FrontmatterValue,
	} from "./frontmatter-ui.ts";

	interface Props {
		docType: DocType;
		value: FrontmatterValue;
		onchange?: (event: CustomEvent<FrontmatterValue>) => void;
	}

	let { docType, value, onchange }: Props = $props();
	let yamlText = $state(dumpFrontmatterYaml(value));
	let error = $state<string | null>(null);

	function handleInput(raw: string): void {
		yamlText = raw;
		const parsed = parseFrontmatterYaml(docType, raw, value);
		if (!parsed.ok) {
			error = parsed.error;
			return;
		}
		error = null;
		value = parsed.value;
		onchange?.(new CustomEvent("change", { detail: parsed.value }));
	}
</script>

<section data-frontmatter-yaml class={cn("flex flex-col gap-2")}>
	{#if error}
		<p data-frontmatter-yaml-error class={cn("rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive")}>
			{error}
		</p>
	{/if}
	<textarea
		name="frontmatter_yaml"
		value={yamlText}
		rows="12"
		spellcheck="false"
		oninput={(event) => handleInput(event.currentTarget.value)}
		class={cn("border-input bg-background min-h-64 rounded-md border px-3 py-2 font-mono text-sm shadow-xs")}
	></textarea>
</section>
