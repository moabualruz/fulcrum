<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type Source = "csv" | "jira" | "linear" | "plane";
  type Step = 1 | 2 | 3 | 4 | 5;

  interface FieldMapping {
    sourceField: string;
    targetField: string;
  }

  const SOURCE_DETAILS: Record<Source, { label: string; icon: string; description: string }> = {
    csv: { label: "CSV", icon: "📄", description: "Import tasks from a CSV file" },
    jira: { label: "Jira", icon: "🔵", description: "Import from Atlassian Jira project" },
    linear: { label: "Linear", icon: "⚡", description: "Import from Linear workspace" },
    plane: { label: "Plane", icon: "▦", description: "Import from a Plane workspace export" },
  };

  const TARGET_FIELDS = ["title", "description", "status", "priority", "assignee", "labels", "due_date", "story_points"];
  const sources = data.importers.map((importer) => ({
    id: importer.name as Source,
    enabled: importer.enabled,
    ...SOURCE_DETAILS[importer.name as Source],
  })).filter((source) => source.label);

  let step: Step = 1;
  let selectedSource: Source | null = null;
  let uploadedFile: File | null = null;
  let csvRowCount = 0;
  let csvPreviewRows: string[][] = [];
  let csvHeaders: string[] = [];
  let fieldMappings: FieldMapping[] = [];
  let dryRunResults: { importable: number; skipped: number; errors: string[] } | null = null;
  let importing = false;
  let importProgress = 0;
  let importDone = false;
  let error = "";

  function selectSource(src: Source) {
    selectedSource = src;
    error = "";
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadedFile = file;

    // Parse CSV headers
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(Boolean);
      csvRowCount = Math.max(0, lines.length - 1);
      if (lines.length > 0) {
        csvHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        csvPreviewRows = lines.slice(1, 6).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
        fieldMappings = csvHeaders.slice(0, TARGET_FIELDS.length).map((src, i) => ({
          sourceField: src,
          targetField: TARGET_FIELDS[i] ?? "",
        }));
      }
    };
    reader.readAsText(file);
  }

  function nextStep() {
    if (step < 5) step = (step + 1) as Step;
  }

  function prevStep() {
    if (step > 1) step = (step - 1) as Step;
  }

  async function runDryRun() {
    error = "";
    if (selectedSource !== "csv") {
      error = "This importer is not configured for project import preview yet.";
      return;
    }
    dryRunResults = {
      importable: csvRowCount,
      skipped: 0,
      errors: [],
    };
    nextStep();
  }

  async function confirmImport() {
    importing = true;
    importProgress = 0;
    error = "";
    importing = false;
    error = "Importer execution requires the application import service.";
  }
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}/settings" class={cn("text-sm text-muted-foreground hover:underline")}>← Settings</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Import Tasks</h1>
  </div>
</header>

<!-- Step indicator -->
<div class={cn("flex items-center gap-2 mb-8 text-xs")}>
  {#each [1, 2, 3, 4, 5] as s}
    <div class={cn(
      "flex items-center justify-center w-6 h-6 rounded-full font-medium transition-colors",
      step === s ? "bg-primary text-primary-foreground" :
      step > s ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
    )}>{step > s ? "✓" : s}</div>
    {#if s < 5}<div class={cn("h-px flex-1 bg-border")} />{/if}
  {/each}
</div>

{#if error}
  <p class={cn("text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md mb-4")}>{error}</p>
{/if}

<!-- Step 1: Select source -->
{#if step === 1}
  <div class={cn("flex flex-col gap-4")}>
    <h2 class={cn("text-base font-semibold")}>Select import source</h2>
    <div class={cn("grid grid-cols-2 gap-3 sm:grid-cols-3")}>
      {#each sources as src}
        <button
          onclick={() => selectSource(src.id)}
          disabled={!src.enabled}
          class={cn(
            "flex flex-col items-start gap-1.5 p-4 rounded-lg border-2 text-left transition-all",
            selectedSource === src.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40",
            !src.enabled && "opacity-50"
          )}
        >
          <span class={cn("text-2xl")}>{src.icon}</span>
          <span class={cn("text-sm font-medium")}>{src.label}</span>
          <span class={cn("text-xs text-muted-foreground")}>{src.description}</span>
          {#if !src.enabled}
            <span class={cn("text-[11px] text-muted-foreground")}>Feature flag off</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class={cn("flex justify-end mt-2")}>
      <button
        onclick={nextStep}
        disabled={!selectedSource}
        class={cn("text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
      >
        Next →
      </button>
    </div>
  </div>

<!-- Step 2: Upload / Authenticate -->
{:else if step === 2}
  <div class={cn("flex flex-col gap-4")}>
    <h2 class={cn("text-base font-semibold")}>
      {selectedSource === "csv" ? "Upload CSV file" : `Connect to ${sources.find((s) => s.id === selectedSource)?.label}`}
    </h2>

    {#if selectedSource === "csv"}
      <label class={cn("flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-muted/30 transition-colors")}>
        <span class={cn("text-3xl")}>📄</span>
        <span class={cn("text-sm font-medium")}>Click to upload CSV</span>
        <span class={cn("text-xs text-muted-foreground")}>Supports standard CSV with a header row</span>
        <input type="file" accept=".csv" onchange={handleFileChange} class={cn("hidden")} />
      </label>
      {#if uploadedFile}
        <p class={cn("text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md")}>
          Loaded: {uploadedFile.name} ({csvHeaders.length} columns, {csvPreviewRows.length}+ rows preview)
        </p>
      {/if}
    {:else}
      <div class={cn("bg-muted/30 rounded-lg p-6 text-center")}>
        <p class={cn("text-sm text-muted-foreground mb-3")}>
          Connect your {sources.find((s) => s.id === selectedSource)?.label} account to import.
        </p>
        <button class={cn("text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}>
          Authenticate with {sources.find((s) => s.id === selectedSource)?.label}
        </button>
      </div>
    {/if}

    <div class={cn("flex gap-2 justify-between mt-2")}>
      <button onclick={prevStep} class={cn("text-sm px-4 py-2 rounded-md border border-border hover:bg-muted")}>← Back</button>
      <button
        onclick={nextStep}
        disabled={selectedSource === "csv" && !uploadedFile}
        class={cn("text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
      >
        Next →
      </button>
    </div>
  </div>

<!-- Step 3: Field mapping -->
{:else if step === 3}
  <div class={cn("flex flex-col gap-4")}>
    <h2 class={cn("text-base font-semibold")}>Field mapping</h2>
    {#if csvHeaders.length > 0}
      <!-- CSV preview -->
      <div class={cn("border border-border rounded-lg overflow-hidden text-xs")}>
        <div class={cn("bg-muted px-3 py-1.5 font-medium")}>Preview (first 5 rows)</div>
        <div class={cn("overflow-x-auto")}>
          <table class={cn("w-full")}>
            <thead>
              <tr>
                {#each csvHeaders as h}
                  <th class={cn("px-2 py-1 text-left font-medium bg-muted/50")}>{h}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each csvPreviewRows as row}
                <tr class={cn("border-t border-border")}>
                  {#each row as cell}
                    <td class={cn("px-2 py-1 truncate max-w-24")}>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mapping UI -->
      <div class={cn("flex flex-col gap-2")}>
        {#each fieldMappings as mapping, i}
          <div class={cn("flex items-center gap-3 text-sm")}>
            <div class={cn("w-36 font-medium truncate")}>{mapping.sourceField}</div>
            <span class={cn("text-muted-foreground")}>→</span>
            <select
              bind:value={fieldMappings[i].targetField}
              class={cn("h-8 flex-1 rounded-md border border-input px-2 bg-background text-sm")}
            >
              <option value="">Skip</option>
              {#each TARGET_FIELDS as f}
                <option value={f}>{f}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {:else}
      <p class={cn("text-sm text-muted-foreground")}>No fields to map (non-CSV source: auto-mapped).</p>
    {/if}

    <div class={cn("flex gap-2 justify-between mt-2")}>
      <button onclick={prevStep} class={cn("text-sm px-4 py-2 rounded-md border border-border hover:bg-muted")}>← Back</button>
      <button onclick={runDryRun} class={cn("text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}>
        Preview import →
      </button>
    </div>
  </div>

<!-- Step 4: Dry-run results -->
{:else if step === 4}
  <div class={cn("flex flex-col gap-4")}>
    <h2 class={cn("text-base font-semibold")}>Import preview</h2>
    {#if dryRunResults}
      <div class={cn("grid grid-cols-3 gap-3")}>
        <div class={cn("p-4 rounded-lg border border-border bg-green-50 text-green-700")}>
          <div class={cn("text-2xl font-bold")}>{dryRunResults.importable}</div>
          <div class={cn("text-xs mt-0.5")}>Tasks to import</div>
        </div>
        <div class={cn("p-4 rounded-lg border border-border bg-yellow-50 text-yellow-700")}>
          <div class={cn("text-2xl font-bold")}>{dryRunResults.skipped}</div>
          <div class={cn("text-xs mt-0.5")}>Skipped (duplicates)</div>
        </div>
        <div class={cn("p-4 rounded-lg border border-border", dryRunResults.errors.length > 0 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground")}>
          <div class={cn("text-2xl font-bold")}>{dryRunResults.errors.length}</div>
          <div class={cn("text-xs mt-0.5")}>Errors</div>
        </div>
      </div>
      {#if dryRunResults.errors.length > 0}
        <div class={cn("border border-destructive/30 rounded-lg p-3")}>
          <div class={cn("text-xs font-medium text-destructive mb-1")}>Errors</div>
          {#each dryRunResults.errors as e}
            <div class={cn("text-xs text-destructive")}>{e}</div>
          {/each}
        </div>
      {/if}
    {/if}
    <div class={cn("flex gap-2 justify-between mt-2")}>
      <button onclick={prevStep} class={cn("text-sm px-4 py-2 rounded-md border border-border hover:bg-muted")}>← Back</button>
      <button
        onclick={nextStep}
        disabled={(dryRunResults?.importable ?? 0) === 0}
        class={cn("text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
      >
        Confirm import →
      </button>
    </div>
  </div>

<!-- Step 5: Import -->
{:else if step === 5}
  <div class={cn("flex flex-col gap-6")}>
    <h2 class={cn("text-base font-semibold")}>Importing tasks</h2>
    {#if importDone}
      <div class={cn("text-center py-8")}>
        <div class={cn("text-4xl mb-3")}>✅</div>
        <h3 class={cn("text-lg font-semibold")}>Import complete!</h3>
        <p class={cn("text-sm text-muted-foreground mt-1")}>
          {dryRunResults?.importable ?? 0} tasks imported into the project.
        </p>
        <a
          href="/projects/{data.projectId}"
          class={cn("inline-block mt-4 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          Go to project
        </a>
      </div>
    {:else}
      <div class={cn("flex flex-col gap-3")}>
        {#if importing}
          <p class={cn("text-sm text-muted-foreground")}>
            Importing {dryRunResults?.importable ?? 0} tasks…
          </p>
          <div class={cn("h-3 rounded-full bg-muted overflow-hidden")}>
            <div
              class={cn("h-full bg-primary rounded-full transition-all duration-200")}
              style="width: {importProgress}%"
            />
          </div>
          <p class={cn("text-xs text-muted-foreground text-right")}>{importProgress}%</p>
        {/if}
        {#if !importing}
          <button
            onclick={confirmImport}
            class={cn("self-start text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            Start import
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
