<script lang="ts">
	import { DOC_TYPE_LABELS, groupTemplatesByDocType, type WebDocTemplate } from "$lib/docs/doc-templates";
	import { SEEDED_DOC_TYPES } from "$lib/docs/template-picker";
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";

	interface Props {
		templates: WebDocTemplate[];
		projectId?: string | null;
	}

	let { templates, projectId = null }: Props = $props();
	let selectedDocType = $state(SEEDED_DOC_TYPES[0]);
	const grouped = $derived(groupTemplatesByDocType(templates));
</script>

<section data-doc-templates-settings class={cn("flex max-w-5xl flex-col gap-5")}>
	<header class={cn("flex items-center justify-between gap-3 border-b border-border pb-4")}>
		<div>
			<h1 class={cn("text-2xl font-semibold tracking-tight")}>Templates</h1>
			<p class={cn("text-muted-foreground text-sm")}>
				{projectId ? "Project-scoped document templates." : "Organization default document templates."}
			</p>
		</div>
	</header>

	<form method="POST" data-template-create-form class={cn("border-border grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_1fr_auto]")}>
		<input type="hidden" name="projectId" value={projectId ?? ""} />
		<label class={cn("flex flex-col gap-1 text-sm")}>
			<span class={cn("font-medium")}>Name</span>
			<input name="name" required class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")} />
		</label>
		<label class={cn("flex flex-col gap-1 text-sm")}>
			<span class={cn("font-medium")}>Type</span>
			<input type="hidden" name="docType" value={selectedDocType} />
			<Select bind:value={selectedDocType} type="single">
				<SelectTrigger aria-label="Template type">
					<SelectValue placeholder={DOC_TYPE_LABELS[selectedDocType]} />
				</SelectTrigger>
				<SelectContent>
					{#each SEEDED_DOC_TYPES as docType (docType)}
						<SelectItem value={docType} label={DOC_TYPE_LABELS[docType]} />
					{/each}
				</SelectContent>
			</Select>
		</label>
		<button type="submit" name="intent" value="create" class={cn(buttonVariants({ variant: "primary" }), "self-end")}>Create</button>
		<label class={cn("md:col-span-3 flex flex-col gap-1 text-sm")}>
			<span class={cn("font-medium")}>Body</span>
			<textarea name="bodyTemplate" rows="5" class={cn("border-input bg-background rounded-md border px-3 py-2 text-sm")}></textarea>
		</label>
	</form>

	<div class={cn("grid gap-4")}>
		{#each SEEDED_DOC_TYPES as docType (docType)}
			<section data-template-doc-type={docType} class={cn("border-border rounded-md border")}>
				<header class={cn("bg-muted/40 flex items-center justify-between gap-3 border-b border-border px-4 py-3")}>
					<h2 class={cn("text-sm font-semibold")}>{DOC_TYPE_LABELS[docType]}</h2>
					<span class={cn("text-muted-foreground text-xs")}>{grouped[docType]?.length ?? 0} templates</span>
				</header>
				<div class={cn("divide-y divide-border")}>
					{#each grouped[docType] ?? [] as template (template.id)}
						<form method="POST" data-template-row class={cn("grid gap-3 p-4 md:grid-cols-[1fr_auto]")}>
							<input type="hidden" name="id" value={template.id} />
							<input type="hidden" name="docType" value={template.docType} />
							<div class={cn("flex flex-col gap-2")}>
								<div class={cn("flex flex-wrap items-center gap-2")}>
									<input name="name" value={template.name} class={cn("border-input bg-background h-8 rounded-md border px-2 text-sm")} />
									{#if template.isDefault}
										<span data-template-default class={cn("bg-primary text-primary-foreground rounded px-2 py-0.5 text-xs")}>Default</span>
									{/if}
									<span class={cn("text-muted-foreground text-xs")}>{template.projectId ? "Project" : "Org"}</span>
								</div>
								<textarea name="bodyTemplate" rows="4" class={cn("border-input bg-background rounded-md border px-3 py-2 text-sm")}>{template.bodyTemplate}</textarea>
							</div>
							<div class={cn("flex flex-row gap-2 md:flex-col")}>
								<button type="submit" name="intent" value="update" class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Save</button>
								<button type="submit" name="intent" value="setDefault" class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Set default</button>
								<button type="submit" name="intent" value="delete" disabled={!template.projectId} class={cn(buttonVariants({ variant: "danger", size: "sm" }))}>Delete</button>
							</div>
						</form>
					{:else}
						<p class={cn("text-muted-foreground p-4 text-sm")}>No templates.</p>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</section>
