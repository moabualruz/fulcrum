<script lang="ts">
  let { data, form } = $props();
</script>

<section class="inference-settings">
  <h1>Inference</h1>

  {#await data.streamed.health}
    <p>Loading inference status</p>
  {:then health}
    <p class="status" data-status={health.status}>Backend status: {health.status}</p>
    <p>Backends: {health.backends.join(", ")}</p>
  {:catch}
    <p class="status" data-status="down">Backend status: down</p>
  {/await}

  <h2>Models</h2>
  {#await data.streamed.models}
    <p>Loading models</p>
  {:then models}
    {#if models.length === 0}
      <p>No models downloaded.</p>
    {:else}
      <ul>
        {#each models as model}
          <li class="model-row">
            <span>{model.id} · {model.kind} · {model.downloaded ? "downloaded" : "missing"}</span>
            {#if !model.downloaded}
              <form method="POST" action="?/pullModel">
                <input type="hidden" name="modelId" value={model.id} />
                <button type="submit">Download</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:catch}
    <p>Model list unavailable.</p>
  {/await}

  {#if form?.pullProgress}
    <div
      class="download-progress"
      data-model-download-progress={form.pullProgress.pct}
      aria-live="polite"
    >
      <p>{form.pullProgress.modelId} download {form.pullProgress.pct}%</p>
      <progress value={form.pullProgress.pct} max="100"></progress>
    </div>
  {/if}

  <h2>Test embed</h2>
  <form method="POST" action="?/testEmbed" class="embed-form">
    <label for="embed-text">Text</label>
    <div class="embed-row">
      <input id="embed-text" name="text" type="text" value="hello world" />
      <button type="submit">Test embed</button>
    </div>
  </form>

  {#if form?.success}
    <div class="embed-result" data-embed-dimensions={form.dimensions}>
      <p>Dimensions: {form.dimensions}</p>
      <p>Model: {form.model} · cached={form.cached}</p>
      <p>Preview: {form.preview?.join(", ")}</p>
    </div>
  {:else if form?.error}
    <p class="embed-error" data-embed-error>{form.error}</p>
  {/if}
</section>

<style>
  .inference-settings {
    max-width: 900px;
    padding: 2rem;
  }

  .status {
    font-weight: 600;
  }

  .embed-form {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .embed-row {
    display: flex;
    gap: 0.5rem;
  }

  .model-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0.25rem 0;
  }

  .download-progress {
    margin: 1rem 0;
  }

  input {
    min-width: 0;
    flex: 1;
  }

  .embed-result,
  .embed-error {
    margin-top: 0.75rem;
  }
</style>
