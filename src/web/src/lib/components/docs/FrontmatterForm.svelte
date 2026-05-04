<script lang="ts">
	import type { DocType } from "@fulcrum/db/entities/docs/enums.ts";
	import { cn } from "$lib/utils.js";
	import {
		getFrontmatterFields,
		validateFrontmatter,
		type FrontmatterValue,
	} from "./frontmatter-ui.ts";

	interface Props {
		docType: DocType;
		value: FrontmatterValue;
		errors?: Record<string, string[]>;
		onchange?: (event: CustomEvent<FrontmatterValue>) => void;
	}

	let { docType, value, errors = {}, onchange }: Props = $props();

	const fields = $derived(getFrontmatterFields(docType));
	const localErrors = $derived({
		...validateFrontmatter(docType, value).errors,
		...errors,
	});

	function emit(next: FrontmatterValue): void {
		value = next;
		onchange?.(new CustomEvent("change", { detail: next }));
	}

	function setScalar(name: string, raw: string): void {
		emit({ ...value, [name]: raw });
	}

	function setArray(name: string, raw: string): void {
		const values = raw
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
		emit({ ...value, [name]: values });
	}

	function arrayText(name: string): string {
		const raw = value[name];
		return Array.isArray(raw) ? raw.filter((entry) => typeof entry === "string").join(", ") : "";
	}
</script>

<section data-frontmatter-form class={cn("flex flex-col gap-3")}>
	<input type="hidden" name="frontmatter_json" value={JSON.stringify(value)} />
	{#each fields as field (field.name)}
		<div class={cn("flex flex-col gap-1.5")}>
			<label for={"frontmatter-" + field.name} class={cn("text-sm font-medium")}>
				{field.name}
				{#if field.required}
					<span data-required-field={field.name} aria-label="required">*</span>
				{/if}
			</label>

			{#if field.type === "enum"}
				<select
					id={"frontmatter-" + field.name}
					name={"frontmatter[" + field.name + "]"}
					value={String(value[field.name] ?? "")}
					aria-invalid={localErrors[field.name]?.length ? "true" : undefined}
					onchange={(event) => setScalar(field.name, event.currentTarget.value)}
					class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
				>
					<option value="">Select {field.name}</option>
					{#each field.options as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			{:else if field.type === "array"}
				<input
					id={"frontmatter-" + field.name}
					name={"frontmatter[" + field.name + "]"}
					type="text"
					value={arrayText(field.name)}
					placeholder="comma, separated"
					aria-invalid={localErrors[field.name]?.length ? "true" : undefined}
					oninput={(event) => setArray(field.name, event.currentTarget.value)}
					class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
				/>
			{:else}
				<input
					id={"frontmatter-" + field.name}
					name={"frontmatter[" + field.name + "]"}
					type="text"
					value={String(value[field.name] ?? "")}
					aria-invalid={localErrors[field.name]?.length ? "true" : undefined}
					oninput={(event) => setScalar(field.name, event.currentTarget.value)}
					class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
				/>
			{/if}

			{#if localErrors[field.name]?.length}
				<p data-frontmatter-error={field.name} class={cn("text-destructive text-xs")}>
					{localErrors[field.name]?.[0]}
				</p>
			{/if}
		</div>
	{/each}
</section>
