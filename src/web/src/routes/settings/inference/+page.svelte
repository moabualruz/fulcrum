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

  {#if form?.success && form?.dimensions !== undefined}
    <div class="embed-result" data-embed-dimensions={form.dimensions}>
      <p>Dimensions: {form.dimensions}</p>
      <p>Model: {form.model} · cached={form.cached}</p>
      <p>Preview: {form.preview?.join(", ")}</p>
    </div>
  {:else if form?.error}
    <p class="embed-error" data-embed-error>{form.error}</p>
  {/if}

  <h2>Test generate</h2>
  <form method="POST" action="?/testGenerate" class="embed-form">
    <label for="generate-prompt">Prompt</label>
    <div class="embed-row">
      <input id="generate-prompt" name="prompt" type="text" value="What is the capital of France?" />
      <input name="maxTokens" type="hidden" value="64" />
      <button type="submit">Test generate</button>
    </div>
    <label for="generate-schema">JSON Schema (optional)</label>
    <textarea id="generate-schema" name="schema" rows="4" placeholder={'{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}'}></textarea>
  </form>

  {#if form?.success && form?.generateText !== undefined}
    <div class="generate-result" data-generate-tokens={form.generateTokens}>
      <p>Tokens: {form.generateTokens}</p>
      {#if form.schemaValid !== undefined}
        <p class="schema-validity" data-schema-valid={form.schemaValid}>Schema valid: {form.schemaValid}</p>
      {/if}
      {#if form.schemaValid}
        <pre class="schema-output" data-schema-output>{form.generateText}</pre>
      {:else}
        <p>{form.generateText}</p>
      {/if}
    </div>
  {:else if form?.generateError}
    <p class="embed-error" data-generate-error>{form.generateError}</p>
  {/if}

  <h2>Test classify</h2>
  <form method="POST" action="?/testClassify" class="embed-form">
    <label for="classify-text">Text</label>
    <input id="classify-text" name="text" type="text" value="buy groceries" />
    <label for="classify-labels">Labels</label>
    <div class="embed-row">
      <input id="classify-labels" name="labels" type="text" value="task,question,reminder" />
      <button type="submit">Test classify</button>
    </div>
  </form>

  {#if form?.classifyResults}
    <table class="result-table" data-classify-results={form.classifyResults.length}>
      <thead>
        <tr>
          <th>Label</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {#each form.classifyResults as result}
          <tr>
            <td>{result.label}</td>
            <td>{result.score}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h2>Test tokenize</h2>
  <form method="POST" action="?/testTokenize" class="embed-form">
    <label for="tokenize-text">Text</label>
    <div class="embed-row">
      <input id="tokenize-text" name="text" type="text" value="hello world" />
      <button type="submit">Test tokenize</button>
    </div>
  </form>

  {#if form?.tokenizeResult}
    <div class="tokenize-result" data-tokenize-count={form.tokenizeResult.count}>
      <p>Tokens: {form.tokenizeResult.count}</p>
      <p>{form.tokenizeResult.tokens.join(", ")}</p>
    </div>
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
  .embed-error,
  .tokenize-result,
  .result-table {
    margin-top: 0.75rem;
  }

  .result-table {
    border-collapse: collapse;
    width: 100%;
  }

  .result-table th,
  .result-table td {
    border-bottom: 1px solid #ddd;
    padding: 0.35rem 0;
    text-align: left;
  }
</style>
