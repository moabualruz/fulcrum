# R5 — RAG, Embeddings, Tree-sitter, Memory

> Research audit for Fulcrum (PI) retrieval, code-aware search, and memory
> subsystems. Scope: state of the art as of 2025 Q2 / 2026 Q1. Date of write:
> 2026-04-14.
>
> The central question for Fulcrum: **do we embed text and code with the same
> model, or do we run two parallel indexes with specialized models?** The
> secondary question: **what does a production-grade memory layer look like,
> and what parts of Mem0 / Letta / Zep are worth stealing?**

---

## 1. Text embedding — SOTA survey

### 1.1 Landscape at a glance

The text-embedding space in 2025 is dominated by three families:

1. **Encoder-only transformers fine-tuned with contrastive loss** — the
   traditional "BERT-style" recipe (BGE-M3, Nomic, mxbai). Fast, small, good
   at retrieval, weak at instruction following.
2. **Decoder-only LLMs repurposed as embedders** — the new wave
   (Qwen3-Embedding, E5-Mistral-7B, NV-Embed, Gemini-Embedding,
   Linq-Embed-Mistral). Much larger, instruction-tuned, dominate the MTEB
   multilingual leaderboard. More expensive per token but multilingual +
   instruction-aware.
3. **Proprietary API-only** — Cohere Embed v3/v4, OpenAI text-embedding-3,
   Voyage v3. Closed weights, best-in-class for their target domains,
   billed per 1M tokens.

### 1.2 Model-by-model notes

| Model                       | Params | Dim (native / min)   | Max tokens | License    | Notes                                                                 |
| --------------------------- | ------ | -------------------- | ---------- | ---------- | --------------------------------------------------------------------- |
| **Qwen3-Embedding-0.6B**    | 0.6B   | 1024 (Matryoshka 32) | 32k        | Apache 2.0 | Best sub-1B model, close to Gemini-Embedding. Instruction-aware.      |
| **Qwen3-Embedding-4B**      | 4B     | 2560                 | 32k        | Apache 2.0 | Mid-tier, great multilingual retrieval.                               |
| **Qwen3-Embedding-8B**      | 8B     | 4096 (Matryoshka 32) | 32k        | Apache 2.0 | #1 MTEB multilingual (70.58 as of 2025-06). Heaviest but best.        |
| **BGE-M3**                  | 0.56B  | 1024                 | 8192       | MIT        | Hybrid dense+sparse+colbert in one model. Strong multilingual.        |
| **BGE-multilingual-gemma2** | 9B     | 3584                 | 8192       | Gemma      | High-quality multilingual, gemma-licensed.                            |
| **E5-mistral-7b-instruct**  | 7B     | 4096                 | 32k        | MIT        | Original decoder-embedder. Still strong, but older.                   |
| **NV-Embed-v2**             | 7.85B  | 4096                 | 32k        | CC-BY-NC   | NVIDIA, MTEB English leader mid-2024. Non-commercial license.         |
| **Nomic-embed-text-v1.5**   | 0.14B  | 768 (Matryoshka)     | 8192       | Apache 2.0 | Tiny, Matryoshka-native, open training recipe. Good for edge.         |
| **Nomic-embed-v2-moe**      | 0.47B  | 768                  | 2048       | Apache 2.0 | Mixture-of-experts multilingual embedder.                             |
| **mxbai-embed-large-v1**    | 0.34B  | 1024 (Matryoshka)    | 512        | Apache 2.0 | Mixedbread; efficient, Matryoshka.                                    |
| **Cohere Embed v3**         | ?      | 1024 / 384           | 512        | Closed     | Strong general-purpose, compressed-embedding option.                  |
| **Cohere Embed v4**         | ?      | 256–1536 (Matryoshka)| 128k       | Closed     | 2024/2025 release; long-context, multimodal.                          |
| **OpenAI t-e-3-small**      | ?      | 1536 (Matryoshka)    | 8192       | Closed     | Cheap, solid general-purpose.                                         |
| **OpenAI t-e-3-large**      | ?      | 3072 (Matryoshka)    | 8192       | Closed     | Higher quality, more expensive.                                       |
| **Voyage-3 / Voyage-3-large** | ?    | 1024 (Matryoshka)    | 32k        | Closed     | Retrieval-focused, outperforms OpenAI on general retrieval.           |
| **Voyage-code-3**           | ?      | 1024 (Matryoshka)    | 32k        | Closed     | Code-specialized. See §2.                                             |
| **Jina embeddings v3**      | 0.57B  | 1024 (Matryoshka)    | 8192       | Apache 2.0 | Multi-task LoRA adapters.                                             |
| **Jina embeddings v4**      | 3.8B   | 2048                 | 32k        | Apache 2.0 | Late-interaction mode, multimodal.                                    |

### 1.3 Key axes of choice

**Instruction-tuned vs base.** Qwen3, E5-Mistral, NV-Embed all accept a
per-query "instruction" prefix (e.g. `Instruct: Given a natural language
query, retrieve relevant passages to answer it\nQuery: ...`). On asymmetric
retrieval this gives +1–3 nDCG points over base. The tradeoff: you must store
*which* instruction was used at index time because query and document
instructions differ.

**Matryoshka Representation Learning (MRL).** Newer models (Qwen3,
Nomic, mxbai, OpenAI v3, Cohere v4, Voyage) are trained so the first N
dimensions of the embedding are already a good embedding on their own. Lets
you do "store 4096-dim, query at 256-dim" for coarse recall, rerank at
higher dim. Cost: ~10–20% of dimensions for ~1–2% quality loss at the
truncation points the models were explicitly trained on.

**Dimension vs quality.** A 1024-dim Qwen3-0.6B embedding is roughly
equivalent to 1536-dim OpenAI-small on retrieval. High dimensions matter
most at scale (>10M docs) where you need fine-grained separation; for
agent workspaces (<100k chunks) 768–1024 is almost always enough.

**Context length.** Long-context embedding models (Jina v3+, Qwen3,
Cohere v4) embed 8k–32k tokens in one shot, but quality degrades: a single
vector cannot faithfully represent a 32k-token document. You still want
chunking; long-context is only useful so the *chunk boundary* doesn't
have to be adversarially small.

### 1.4 What to use for Fulcrum (text)

Local-first, CPU-friendly, Apache-2.0, and strong enough for agent memory
is a narrow slot. The defensible choices are:

1. **Qwen3-Embedding-0.6B** (preferred). 1024-dim, instruction-aware,
   Apache-2.0, runs on CPU with ONNX/GGUF. Matryoshka-truncatable.
2. **BGE-M3** as fallback if Qwen3 turns out to be hard to ship (it's
   MIT, 1024-dim, 8k context, and has hybrid dense+sparse modes).
3. **Nomic-embed-text-v1.5** for the "ultra-lightweight edge" profile —
   140M params, 768-dim, works on devices without GPU.

---

## 2. Code embedding — specialized models

### 2.1 Does code need its own embedder?

The honest answer in 2025: **specialized code embedders beat general
text embedders on code retrieval by 10–20%, but only on code-specific
benchmarks**, and general models have closed most of the gap because
they now train on mixed text+code.

**Evidence:**

- Voyage-code-3 vs OpenAI-text-embedding-3-large: +14.64% on code
  retrieval (CoIR-like benchmarks) at 1024-dim, +17.66% at 256-dim.
- Jina-code-embeddings (1.5B) matches voyage-code-3 on 25 code retrieval
  tasks at ~79% average, beats gemini-embedding-001.
- Qwen3-Embedding-8B sits ~4–6 points *below* voyage-code-3 on code-only
  benchmarks but beats it on text-to-code retrieval with natural-language
  queries (NL2Code), because of its decoder-style instruction following.

The practical upshot: **if the query is natural language ("find the
function that parses JWTs"), a big instruction-tuned text embedder is
competitive. If the query is code ("find similar snippets to this
function"), you want a code-specialized encoder.**

### 2.2 Current models

| Model                           | Params | Dim (native)    | License    | Notes                                                              |
| ------------------------------- | ------ | --------------- | ---------- | ------------------------------------------------------------------ |
| **Voyage-code-3**               | ?      | 1024 (Matryoshka) | Closed   | SOTA on CoIR, 32k context, hosted only.                            |
| **jina-code-embeddings-1.5B**   | 1.5B   | 1024            | Apache 2.0 | Trained from Qwen2.5-Coder. Matches voyage-code-3 on CoIR.         |
| **jina-code-embeddings-0.5B**   | 0.5B   | 768             | Apache 2.0 | Smaller sibling, still 78% average on CoIR.                        |
| **jina-embeddings-v2-base-code** | 0.16B | 768             | Apache 2.0 | Older but lightweight; decent baseline.                            |
| **CodeSage-large / -v2**        | 1.3B   | 2048            | Apache 2.0 | BERT-style, trained on 9 languages.                                |
| **StarEncoder / StarCoder2-3B** | 3B     | 3072            | BigCode    | Retrieval via mean pooling of StarCoder2 hidden states; not native.|
| **UniXcoder**                   | 0.125B | 768             | MIT        | Legacy, still used as a baseline.                                  |
| **CodeBERT / GraphCodeBERT**    | 0.12B  | 768             | MIT        | Legacy, CodeSearchNet-era. Don't use.                              |

### 2.3 What makes code embedding different from text

1. **Identifier overlap dominates similarity.** If you embed code as
   plain text, cosine-similarity is driven by shared tokens
   (`for`, `self`, `value`). Two functions that do the same thing with
   different variable names end up far apart. Specialized code embedders
   are contrastively trained to ignore identifier renames.
2. **Syntactic structure matters.** A call graph pattern (A→B→C) is
   semantically meaningful but invisible to a bag-of-tokens view.
   Graph-aware code embedders (GraphCodeBERT, UniXcoder) inject AST or
   data-flow edges. Modern decoder-based code embedders don't do this
   explicitly — they rely on the base LM having learned it from
   pre-training.
3. **Docstring alignment.** Good code embedders are trained on
   `(docstring, function_body)` pairs so NL queries land near the
   matching function. This is the single biggest factor on CoIR.
4. **Language mix.** Java and Python look wildly different lexically
   but may do the same thing. Code embedders trained on >6 languages
   handle cross-language retrieval; text embedders degrade sharply
   outside the dominant language in pre-training.

### 2.4 Benchmarks to track

- **CodeSearchNet (CSN)** — legacy, 6 languages, NL→code retrieval.
  Still reported but saturated.
- **CoIR / CoIR-2025** — 10 tasks across text↔code, code↔code, hybrid.
  Current standard. `voyage-code-3` ~77.3, `jina-code-embeddings-1.5B`
  ~79.0, `gemini-embedding-001` ~77.4.
- **CoSQA / CoSQA+** — NL questions paired with Python answers.
- **SWE-bench retrieval subset** — real GitHub issues, measures whether
  a retriever can surface the file that needs editing. Very hard;
  best retrievers are around 60% recall@10.
- **RepoEval / CrossCodeEval** — cross-file completion, tests whether
  the retriever can find the definition imported from another file.

### 2.5 Recommendation for Fulcrum (code)

Hybrid decision tree:

- **If we can afford a second model slot:** use
  `jina-code-embeddings-0.5B` (or v2-base-code at 160M for ultra-small)
  alongside Qwen3-0.6B for text. Apache-2.0, CPU-runnable.
- **If we want one model for everything:** use Qwen3-Embedding-0.6B
  with explicit instruction prefixes (`Instruct: Given a natural
  language query, retrieve the relevant code...`). Accept the 5–10%
  quality loss on pure code-to-code retrieval.
- **Never use plain BERT / CodeBERT / GraphCodeBERT.** Legacy; beaten
  by everything listed above.

Fulcrum's sweet spot is "agent that edits its own project code": most
queries will come in as natural language ("where does the retry logic
live?"). That's the regime where a big text model wins or ties. Start
with **Qwen3-0.6B for both paths**, add `jina-code-embeddings-0.5B`
later if we see code-to-code recall problems.

---

## 3. Tree-sitter + AST-aware chunking

### 3.1 Aider repo-map deep-dive (reference implementation)

Aider's repo-map is the canonical reference for tree-sitter-based code
indexing in a coding agent. It is **not a vector index** — it is a
*static symbol graph sent as context* — but every modern code agent
(Continue.dev, Cursor, Sweep.dev, Zed) has an equivalent layer, and
Aider's algorithm is the clearest public description.

**Inputs:** the git repo, optionally a set of "chat files" (files the
user has explicitly added to the conversation) and a set of
"mentioned" identifiers/files (extracted from the last user message).

**Outputs:** a markdown-ish tree containing the most important
`(file, symbol, line, kind)` tuples across the repo, sized to fit a
token budget (default 1024 tokens).

**Algorithm (reconstructed from `aider/repomap.py`):**

```python
# Pseudocode — simplified from aider/repomap.py
def build_repo_map(chat_files, other_files, mentioned_files, mentioned_idents, budget):
    # 1. Extract tags from every file using tree-sitter
    tags = []                                # Tag = (rel_fname, fname, line, name, kind)
    for f in chat_files + other_files:
        tags += get_tags_cached(f)           # runs tree-sitter .scm query per language
                                             # kind ∈ {"def", "ref"}

    # 2. Build a weighted directed multigraph:
    #    nodes = files, edges = "file A references identifier defined in file B"
    G = networkx.MultiDiGraph()
    defines   = defaultdict(set)             # ident -> set(file)
    references = defaultdict(list)           # ident -> list(file)
    for t in tags:
        if t.kind == "def":
            defines[t.name].add(t.rel_fname)
            G.add_node(t.rel_fname)
        elif t.kind == "ref":
            references[t.name].append(t.rel_fname)

    for ident, ref_files in references.items():
        if ident not in defines:            # only edges to defined identifiers
            continue
        mul = ident_multiplier(ident, mentioned_idents)  # see below
        scaled = math.sqrt(len(ref_files))  # dampen super-popular files
        for def_file in defines[ident]:
            for ref_file in ref_files:
                G.add_edge(ref_file, def_file, weight=mul*scaled, ident=ident)

    # 3. Personalization vector: chat files and mentioned files win
    personalization = {}
    chat_weight = 100.0 / max(1, len(chat_files))
    for f in chat_files:
        personalization[f] = chat_weight
    for f in mentioned_files:
        personalization[f] = personalization.get(f, 0) + chat_weight

    # 4. PageRank with personalization over the reference graph
    try:
        ranked = networkx.pagerank(G, weight="weight", personalization=personalization or None)
    except ZeroDivisionError:
        ranked = networkx.pagerank(G, weight="weight")  # fallback, uniform

    # 5. Distribute file-rank to individual definitions, proportional to edge weight in
    def rank_def_tags(ranked, G):
        def_rank = defaultdict(float)
        for src, dst, data in G.edges(data=True):
            def_rank[(dst, data["ident"])] += ranked[src] * data["weight"]
        return sorted(def_rank.items(), key=lambda kv: -kv[1])

    ranked_defs = rank_def_tags(ranked, G)

    # 6. Binary-search the number of tags whose rendered size fits the budget
    lo, hi = 0, len(ranked_defs)
    best = ""
    mid = min(budget // 25, hi)             # heuristic: ~25 chars per tag
    while lo <= hi:
        tree_str = render_tree(ranked_defs[:mid], chat_files)
        n_tok = count_tokens(tree_str)
        err = abs(n_tok - budget) / budget
        if err < 0.15:
            best = tree_str
            break
        if n_tok > budget:
            hi = mid - 1
        else:
            lo = mid + 1
            best = tree_str
        mid = (lo + hi) // 2
    return best


def ident_multiplier(ident, mentioned):
    m = 1.0
    if ident in mentioned:               m *= 10
    if ident.startswith("_"):             m *= 0.1
    if len(ident) >= 8 and is_mixed_case(ident): m *= 10
    if times_defined(ident) > 5:          m *= 0.1
    return m
```

**Notable design choices:**

1. **PageRank over a dependency graph** is how Aider decides "which files
   are structurally important". A utility module that everyone imports
   will get high rank even if the user hasn't mentioned it.
2. **Personalization vector** is how Aider biases the graph toward the
   current conversation. Chat files get a huge prior; the PageRank
   *flow* then spreads to their direct and indirect dependencies.
3. **Identifier-level multipliers** penalize private (`_foo`) and
   over-defined names (anything defined in >5 files is probably
   `__init__` boilerplate). They boost long mixed-case identifiers
   (more likely to be domain concepts).
4. **Tree-sitter `.scm` queries** do the lexical work — Aider ships a
   query per language capturing `name.definition.function`,
   `name.definition.class`, `name.definition.method`, and
   `name.reference.call` etc. It falls back to a Pygments lexer for
   references when a language lacks a reference query.
5. **Token-budget binary search** is what keeps the repomap at exactly
   `map_tokens` tokens (default 1k) regardless of repo size. This is
   cheap because `render_tree` is pure string work.
6. **Cache layer** keyed on `(path, mtime)` — tags are expensive to
   recompute, so Aider persists them in a per-repo cache directory.

**How Fulcrum should use this:** implement repo-map verbatim as a
*second retrieval channel* alongside vectors, and emit it into the
agent prompt on *every* turn. It costs 1–4k tokens and materially
improves the agent's ability to make small edits without having to
read whole files.

### 3.2 Continue.dev

Continue.dev runs an embedding index of the repo plus a tree-sitter
"code map" similar to Aider's but less algorithmically sophisticated.
Its actual retrieval pipeline is:

1. BM25 over chunk tokens
2. Dense vector search over chunks (default Voyage Code-3 or local
   model)
3. Union the top-k from each, rerank with a cross-encoder if
   configured, return to the LLM.

Chunks are computed by tree-sitter at function/class boundary, with a
fallback to 1500-character sliding window for languages without
Continue's parser. Chunk metadata stored:
`(file, start_line, end_line, symbol_name, symbol_kind, hash)`.

### 3.3 Cursor / Sourcegraph / Sweep / Zed

- **Cursor** uses a proprietary embedding + rerank pipeline. Not public
  but known to use Merkle-tree file-hash caching and a local vector DB
  (TurboPuffer was used at some point; they seem to run their own now).
- **Sourcegraph** built SCIP (Source Code Intelligence Protocol) —
  static analyzer output per-language produces symbol tables with
  exact definitions, references, and types. Much higher fidelity than
  tree-sitter but requires a real type-checker per language. Used in
  `cody` for code navigation and retrieval ranking.
- **Sweep.dev** chunks at function/class boundary via tree-sitter,
  embeds each chunk with `voyage-code-3`, stores in LanceDB. Very
  similar to Continue.
- **Zed** uses tree-sitter for both rendering and a small in-editor
  "smart navigation" index; doesn't do embedding retrieval itself but
  exposes the tree-sitter tree to extensions.

### 3.4 Language coverage

Tree-sitter has well-maintained grammars for: TypeScript/JavaScript,
Python, Rust, Go, Java, C/C++, Ruby, PHP, C#, Kotlin, Swift, Elixir,
Scala, OCaml, Bash, HTML, CSS, SQL, YAML, JSON, TOML, Markdown,
Dockerfile. Aider ships tag queries for ~20 languages; Continue for a
similar set. Fulcrum should target the same core: JS/TS, Python,
Rust, Go, Java, C/C++, + JSON/YAML/MD/Bash/SQL for config-ish files.

### 3.5 Query API basics

A tree-sitter query is an S-expression matched against a parsed tree.
Example (TypeScript function definitions):

```scheme
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

(method_definition
  name: (property_identifier) @name.definition.method) @definition.method

(call_expression
  function: (identifier) @name.reference.call) @reference.call
```

Captures (`@name`) are returned with `(start_byte, end_byte, row, col)`,
letting us extract the exact symbol name plus the enclosing range for
the "chunk" (the whole `function_declaration` node).

**Chunking algorithm:**

```python
def chunk_file(path, src, parser, query, max_bytes=4000):
    tree = parser.parse(src)
    matches = query.matches(tree.root_node)
    chunks = []
    for m in matches:
        node = m.definition_node         # e.g. the function_declaration
        if node.end_byte - node.start_byte > max_bytes:
            # fall back to split at statement boundaries inside the body
            chunks += split_large_node(node, max_bytes)
        else:
            chunks.append(Chunk(
                file=path,
                symbol=m.name,
                kind=m.kind,
                start_line=node.start_point.row,
                end_line=node.end_point.row,
                text=src[node.start_byte:node.end_byte],
                imports=extract_imports(tree),      # file-level
                docstring=extract_docstring(node),
            ))
    # Files with no matching definitions (config, markdown, sql):
    if not chunks:
        chunks = sliding_window(src, size=1500, overlap=200)
    return chunks
```

### 3.6 Best practices

1. **Chunk at symbol boundary.** One function / method / class per
   chunk. Do not merge.
2. **Emit module-level chunks** for files that are mostly top-level
   code (config, declarative manifests).
3. **Split oversized functions** at statement boundary, not
   character-window. Keep at least one full AST block per chunk.
4. **Attach metadata** — file path, start/end line, symbol name, kind,
   imports used, nearest docstring. Metadata is as retrievable as the
   text.
5. **Index the full file** as a separate "file summary" chunk for
   cross-file queries that benefit from file-level BM25.
6. **Don't overlap.** Aider, Continue, Sweep all use zero overlap at
   symbol boundary. Overlap is only useful for character-window
   chunks.
7. **Call-site context.** If budget allows, produce a "neighbor graph"
   per symbol (callers and callees) and include it as metadata on the
   chunk, so reranking can boost chunks whose callers match the query.

---

## 4. AST vs character-window chunking

### 4.1 Why naive line-based chunking breaks

A 512-token sliding window over a Python file will slice through
functions at arbitrary points. Retrieval then surfaces a chunk that
ends mid-for-loop with no signature, no name, no docstring — the LLM
cannot use it without loading the whole file. On CodeSearchNet,
line-window chunking underperforms function-level chunking by 8–15
points nDCG@10 across models.

### 4.2 Empirical evidence

- **Sweep.dev blog post (2024)**: switching from 1500-char windows to
  tree-sitter function chunks gave +18% top-5 file-retrieval accuracy
  on an internal SWE-bench-lite slice.
- **Continue.dev docs**: "AST-aware chunks consistently outperform
  character windows on our internal benchmarks, especially for
  languages with long functions (Java, C++)."
- **SWE-bench retrieval papers (2024–2025)**: RepoGraph and other
  AST-augmented retrievers beat plain-chunk BM25 by 10–25% recall@10
  on issue→file localization.
- **CodeRAG-Bench (2024)**: across 8 tasks, function-level dense
  retrieval beats 512-token windowing by 6–12 points on average.

### 4.3 Cross-file context

The hard case for any chunker: a function uses a type defined in
another file. Pure chunk retrieval will surface the function but not
the type. Three mitigations:

1. **Symbol resolution at retrieval time.** When you return chunk C,
   also return chunks that define any symbol C imports. Requires a
   symbol table.
2. **Repo-map in the prompt.** Aider-style symbol map gives the LLM a
   birds-eye view so it can ask follow-up questions. Cheaper than full
   resolution.
3. **Multi-hop retrieval.** Run retrieval twice: first for the query,
   then for each imported symbol mentioned in the top chunks. Expensive
   but highest recall.

### 4.4 Fulcrum stance

- **Text (Markdown, docs, plans):** 512-token sentence-split chunks
  with 64-token overlap. Langchain-style recursive splitter or
  just split on `\n\n`.
- **Code:** tree-sitter at function/class boundary, zero overlap,
  sliding window fallback for files without definitions.
- **Both:** always store `(path, start_line, end_line)` so we can
  rebuild the chunk→source link.

---

## 5. Reranking

### 5.1 Bi-encoder vs cross-encoder

**Bi-encoder** (every embedding model in §1–2): separately embeds
query and document into vectors, similarity is dot-product.
Precomputable. Cheap per query: O(1) vector operation.

**Cross-encoder**: takes `(query, document)` as a concatenated input
to a transformer and emits a single score. Cannot be precomputed. One
forward pass per candidate. Much more accurate (because it sees
cross-attention between query and document) but ~100–1000× slower.

Standard production pattern: bi-encoder retrieves top-K (K=50–200),
cross-encoder reranks to top-k (k=5–20). This is called "two-stage
retrieval" or "retrieve-and-rerank".

### 5.2 Current rerankers

| Model                    | Params | Latency (single pair, CPU→GPU) | License    | Notes                                                            |
| ------------------------ | ------ | ------------------------------ | ---------- | ---------------------------------------------------------------- |
| **BGE-reranker-v2-m3**   | 0.57B  | 30–100ms / 3–10ms              | Apache 2.0 | Multilingual, strong baseline. Default for self-hosted.          |
| **BGE-reranker-v2-gemma**| 9B     | 200–400ms                      | Gemma      | Heavy, higher quality.                                           |
| **Jina-reranker-v2-base**| 0.28B  | 20–80ms / 3–8ms                | Apache 2.0 | Multilingual, 100k+ context. Very fast.                          |
| **Jina-reranker-v3**     | 0.6B   | ~188ms p50                     | Apache 2.0 | 2025, stronger than v2.                                          |
| **Cohere Rerank 3**      | ?      | 600ms (API)                    | Closed     | Hosted. ELO ~1450 on agentset bench.                             |
| **Cohere Rerank 3.5**    | ?      | ~600ms (API)                   | Closed     | Hosted. Current top on mixed benchmarks.                         |
| **Voyage rerank-2**      | ?      | ~200ms (API)                   | Closed     | Multilingual, code-aware.                                        |
| **mxbai-rerank-large-v1**| 0.44B  | ~50ms                          | Apache 2.0 | Mixedbread; good open alternative.                               |
| **Qwen3-Reranker-0.6B/4B/8B** | 0.6–8B | 30–200ms                   | Apache 2.0 | Part of the Qwen3 family; instruction-aware.                     |

### 5.3 When reranking helps

Rerank earns its keep when:
- The first-stage retriever has poor precision@50 but decent
  recall@50 — the reranker salvages recall.
- Queries are long and compositional — cross-attention to the whole
  query matters.
- The corpus has near-duplicates — cross-encoder can differentiate.

Rerank is overhead when:
- First-stage already returns highly relevant results (rare).
- Latency budget is below 200ms.
- Candidates are uniformly short and lexically on-topic (BM25
  dominates).

### 5.4 Latency budget

Single cross-encoder inference on a CPU ≈ 30–100ms per pair for a
500M-param model; on a modern GPU ≈ 3–10ms per pair. Batching helps
linearly up to ~32 pairs. For interactive use (<500ms budget), rerank
at most 50–100 candidates with a 300–600M model on CPU, or 200–500
candidates on GPU.

### 5.5 Ensembling rerankers

Rarely worth it. The standard trick that *does* work: run a
cheap bi-encoder rerank (e.g. ColBERTv2 late interaction) before the
cross-encoder to get from K=500 down to K=100, then cross-encode.
Called "cascaded reranking."

### 5.6 Learning-to-rank

If you have click/relevance feedback from agent runs, you can fit a
small LambdaMART / XGBoost-Ranker on top of features
`(dense_score, bm25_score, rerank_score, recency, path_prior,
user_priors)`. This is how Elasticsearch LTR and Vespa LTR are used
in production search. Rarely needed for agent memory because feedback
is sparse, but **useful for Fulcrum once we log enough run outcomes
per workspace.**

### 5.7 Recommendation

- **Default:** `bge-reranker-v2-m3` (Apache 2.0, 570M, strong
  multilingual). Rerank top-50 from first stage to top-10.
- **Smaller/faster alternative:** `jina-reranker-v2-base-multilingual`
  (280M).
- **LLM-as-judge reranker:** use a small local model
  (Qwen3-4B-Instruct) in "pairwise preference" mode when we want
  interpretable explanations. Only for debugging / offline.

---

## 6. Hybrid search (BM25 + dense + rerank)

### 6.1 Why hybrid

- **BM25 wins** on exact-identifier queries (`findUserById`), version
  strings, acronyms, error codes — anything where the query term
  literally appears.
- **Dense wins** on paraphrase, natural-language intent, cross-lingual
  retrieval, semantic-adjacent matches.
- **They fail on complementary queries**, so fusing recovers recall.

On BEIR, hybrid (RRF) beats either alone by 3–8 nDCG points across
tasks. On code retrieval the delta is larger (5–15 points) because
identifier-exact queries are common.

### 6.2 Reciprocal Rank Fusion (RRF)

```
RRF(d) = Σ_i  1 / (k + rank_i(d))          # k ~ 60, default from the paper
```

Where `rank_i(d)` is document d's rank in ranker i (0-indexed or
1-indexed consistently), and k is a dampening constant. Default k=60.
No score normalization needed, which is why RRF dominates in practice
— it's robust to the fact that BM25 scores and cosine similarities
live on different scales.

### 6.3 Weighted score fusion

Alternative: normalize each ranker's scores (min-max or z-score) and
fuse with `α * dense + (1-α) * bm25`. Needs tuning per corpus.
Generally **worse than RRF in cold-start settings** but marginally
better once you've tuned α on dev data.

### 6.4 Real systems

- **Vespa**: native hybrid with learned linear fusion + phased
  rerank. Strong LTR support.
- **Elasticsearch/OpenSearch**: `knn` query + `match` query combined
  with RRF or linear fusion, optional text-embedding-based rerank via
  `rerank` processor.
- **Weaviate**: hybrid `alpha` parameter, supports RRF.
- **Qdrant**: native hybrid with sparse vectors (BM25 or SPLADE) and
  dense vectors in one index, RRF fusion.
- **TurboPuffer**: object storage-backed vector DB; hybrid is the
  default pattern.
- **Vectara**, **Pinecone Serverless**: hybrid via sparse-dense
  vectors.

### 6.5 LLM as judge for reranking

Increasingly popular: after hybrid + cross-encoder, a small LLM is
asked to pick top-k from top-50 with a structured prompt. Gives
+1–3 points over cross-encoder alone on MTEB-reranking tasks. Costs
~500 tokens + 100 tokens output per query. Useful when we already
have an LLM in the loop and can absorb the latency.

### 6.6 Recommendation for Fulcrum

- **First stage:** BM25 (SQLite FTS5 or Tantivy) ∪ dense
  (Qwen3-0.6B into sqlite-vec / lancedb / qdrant-lite) ∪ repo-map
  (Aider-style PageRank output).
- **Fuse:** RRF with k=60.
- **Rerank:** `bge-reranker-v2-m3` on top-50 from fusion.
- **Optional LLM judge:** only if we see rerank precision stalling.

---

## 7. GraphRAG and graph retrieval

### 7.1 Microsoft GraphRAG in detail

GraphRAG (Microsoft Research, 2024) is a retrieval pipeline that
doesn't store chunks at all — it stores an LLM-extracted knowledge
graph and uses *community summaries* as retrieval units.

**Pipeline:**

```
raw docs
   │
   ▼  chunk (≈300 tokens, configurable)
chunks
   │
   ▼  LLM extract: entities + relationships + claims per chunk
typed nodes + typed edges
   │
   ▼  merge by entity name, dedup, summarize descriptions with LLM
typed graph
   │
   ▼  Hierarchical Leiden community detection
communities at levels 0..N
   │
   ▼  LLM writes a summary per community (level 0 = smallest, level N = most abstract)
community summaries
   │
   ▼  (query time) local or global search
answer
```

**Entity extraction prompt** (simplified):

```
Extract entities of types {Person, Organization, Location, Concept, ...}
and relationships between them from the text below. For each entity,
produce a short description. For each relationship, produce a short
description and a strength 1..10.

TEXT:
<chunk>

OUTPUT (JSON):
{
  "entities":     [{"name":..., "type":..., "description":...}, ...],
  "relationships":[{"source":..., "target":..., "description":..., "strength":...}, ...]
}
```

**Hierarchical Leiden:**

Leiden is an improvement over Louvain that guarantees well-connected
communities. Applied recursively: first pass partitions the whole
graph into level-0 communities; each community is then re-Leiden'd to
produce level-1 sub-communities, etc. Result: a tree of communities
where each node has a community ID at each level.

```python
# Sketch
def hierarchical_leiden(G, max_levels=3, min_community_size=5):
    communities_by_level = []
    current_partition = leiden(G)           # level 0
    communities_by_level.append(current_partition)
    for lvl in range(1, max_levels):
        new_partition = {}
        for comm_id, nodes in group(current_partition):
            if len(nodes) < min_community_size:
                continue
            sub = G.subgraph(nodes)
            sub_part = leiden(sub)
            for node, sub_id in sub_part.items():
                new_partition[node] = (comm_id, sub_id)
        if not new_partition:
            break
        communities_by_level.append(new_partition)
        current_partition = new_partition
    return communities_by_level
```

**Query modes:**

- **Local search**: look up the query's entities, expand to neighbors,
  gather their community summaries + connected chunks, answer.
- **Global search**: partition answer across all level-k community
  summaries, map-reduce: LLM answers partial from each summary, then
  LLM aggregates. Expensive but lets you ask "what themes appear in
  this corpus?".
- **DRIFT / auto-tune**: recent additions combine local + global.

**Costs:** GraphRAG is 10–100× more expensive to *ingest* than a
vector index because every chunk requires an LLM extraction pass.
Retrieval latency is comparable or lower (you're looking up
pre-computed summaries).

### 7.2 LightRAG

Open-source, much cheaper than GraphRAG. Skips community detection;
does dual-level retrieval: (1) local entity-neighborhood, (2) global
entity-topic. Uses a single LLM extraction pass per chunk, no
hierarchical clustering. About 5× cheaper to index than GraphRAG for
~90% of the quality on their benchmarks.

### 7.3 Zep / Graphiti

Zep builds a *temporal* knowledge graph (Graphiti) over chat history:

- Each edge has a `(t_valid, t_invalid)` interval.
- When new facts contradict old ones, Graphiti invalidates the old
  edge *but keeps it in the graph* — the old fact is retrievable for
  "what did I used to believe?" queries.
- Hybrid retrieval: semantic on node/edge descriptions + BM25 on
  descriptions + graph traversal from query entities.
- Reports p95 retrieval latency ~300ms.
- Beats MemGPT on Deep Memory Retrieval by 18.5% in their benchmark.

**Graphiti is the most production-grade open knowledge graph for
agent memory in 2025.** Uses Neo4j or FalkorDB as backend. Worth
studying even if we don't adopt it wholesale.

### 7.4 Neo4j + LLM

The generic "Cypher-generating agent" pattern: LLM emits a Cypher
query, Neo4j returns results, LLM answers. Works well for structured
queries ("show me all PRs merged by Alice last month") but bad at
semantic ones. Combine with vector search inside Neo4j 5.x for
hybrid.

### 7.5 When graph retrieval beats vector + BM25

- Multi-hop queries ("what does X depend on transitively?").
- Questions over heavily normalized data (CRM, procurement, codebase
  structure).
- Summarization of themes across a corpus (GraphRAG's "global
  search").
- When you need provenance / causality / timelines.

Vector retrieval beats graph when:
- The answer is a single passage.
- You don't want a 10–100× ingest cost multiplier.
- Entities overlap wildly (general text corpora, web pages).

### 7.6 Fulcrum stance

GraphRAG-style hierarchical community detection is **overkill for a
project-scoped coding agent** with <10k chunks. But a *light* graph
layer is worth it:

- **Code graph** (functions, classes, imports) — already handled by
  tree-sitter + symbol table.
- **Semantic memory graph** (facts extracted from agent runs) —
  Graphiti-style temporal edges. Bi-temporal validity is the key
  feature we should steal. Implementation: store edges as rows in
  SQLite with `(t_created, t_valid_from, t_valid_to, source_run)`.
- **Skip:** Leiden community detection, GraphRAG global search,
  LLM summarization per community. Not worth the ingest cost.

---

## 8. Memory architectures (episodic / semantic / procedural)

### 8.1 Cognitive-science mapping

From Tulving's taxonomy:

- **Episodic memory** — specific events, place, time, context. Maps to
  *conversation turns* and *run logs* for an agent. "On April 10 I
  ran the build and it failed with X."
- **Semantic memory** — generalized facts, concepts, schemas. Maps to
  *distilled knowledge* extracted from episodes. "The build uses
  pnpm." Lossy compression of many episodes into one fact.
- **Procedural memory** — skills, how-to, motor patterns. Maps to
  *tools, workflows, playbooks* the agent has learned. "To fix this
  kind of bug, do X then Y."

Mature agent memory systems represent all three. Most first-generation
systems (LangChain's `ConversationBufferMemory`) conflate episodic and
semantic and have no procedural layer at all.

### 8.2 Memory decay and consolidation

Inspired by human memory research and the Generative Agents paper
(Park et al. 2023):

- **Recency bias:** retrieval scores boosted for recent items via
  `exp(-Δt / τ)` decay.
- **Importance score:** LLM-assigned 1–10 at write time, factored
  into retrieval score.
- **Access-boost:** every time a memory is retrieved, its importance
  or last-access time updates — "use it or lose it".
- **Reflection** (Park et al.): periodically, the agent reviews its
  N most important recent memories and writes abstract conclusions
  back as new semantic memories. This is where episodic→semantic
  consolidation happens.

**Decay formula (Park et al. retrieval score):**

```
score(m, q) = α * recency(m) + β * importance(m) + γ * relevance(m, q)
recency(m)    = exp(- hours_since_last_access / half_life)
importance(m) ∈ [0, 1]
relevance(m,q)= cos_sim(embed(m), embed(q))
```

Defaults in the paper: α=1, β=1, γ=1, half-life ~ 24 hours.

### 8.3 Mem0

Architecture:

- **Vector DB + optional graph** backend.
- **Three-level scope**: user, session, agent. Each memory has scope
  tags; retrieval filters by scope.
- **Automatic extraction**: on every user/assistant turn, a small
  LLM call extracts "memorable facts" and writes them as new
  memories. Dedup via embedding similarity + LLM consolidation.
- **CRUD API** for explicit writes, plus hook-based automatic mode.
- **Framework-agnostic**: lives as an SDK on top of LangChain,
  CrewAI, AutoGen, etc.

**Key pattern:** Mem0 treats memory as "facts extracted from
conversation" rather than "raw transcript chunks". This gives higher
signal per retrieved unit (you get "user prefers Python over Go"
instead of "turn 34 text").

**Weakness:** no temporal graph, no procedural layer, deduplication
is embedding-similarity-based and occasionally drops information.

### 8.4 Letta (née MemGPT)

MemGPT paper's contribution: treat the LLM context window as
operating-system main memory, with a memory *hierarchy*:

```
┌────────────────────────────────┐
│ Core memory (always in context)│  ← persona block + user block, small
├────────────────────────────────┤
│ Recall memory (conversation)    │  ← full history, searchable, outside ctx
├────────────────────────────────┤
│ Archival memory (long-term)    │  ← vector-indexed arbitrary docs
└────────────────────────────────┘
```

The LLM has tools (`core_memory_append`, `archival_memory_insert`,
`recall_memory_search`, etc.) that it calls itself to page memory in
and out. A long conversation doesn't blow the context window —
history gets summarized and archived, but is retrievable on demand
via tool call.

**MemGPT page-in/page-out loop (pseudocode):**

```python
def memgpt_step(agent, user_msg):
    agent.append_to_history(user_msg)
    while True:
        ctx = assemble_context(
            persona=agent.core.persona,
            user=agent.core.user,
            recent=agent.history.tail(n_tokens=agent.max_tokens - reserve),
        )
        if tokens(ctx) > agent.warn_threshold:
            # "memory pressure": summarize and evict
            summary = llm_summarize(agent.history.head(N))
            agent.recall.insert(agent.history.head(N))      # archive raw
            agent.history.pop_head(N)                        # evict from window
            agent.core.scratchpad += f"\n[summary]: {summary}"

        response = llm(ctx)
        if response.is_tool_call:
            result = execute_tool(response.tool, response.args)
            agent.append_to_history(result)
            if response.tool == "send_message":
                return response.args.text     # stop loop, return reply
        else:
            agent.append_to_history(response)
            return response.text
```

The key invariants:
1. Core memory (persona + user facts) is always in context.
2. History is kept in context *until* it crosses a threshold, then
   the oldest chunk is summarized and moved to recall (SQL/vector).
3. The agent can recover any evicted memory via tool call.

**Letta** wraps this as a full agent runtime: stateful servers, tool
execution, memory persistence. Not a library — you run Letta agents
*inside* Letta. Less flexible than Mem0, more principled.

### 8.5 Generative Agents (Park et al. 2023)

Memory architecture is the blueprint for most modern "agent with
persona" systems:

- **Memory stream:** append-only log of observations.
- **Retrieval:** scored by (recency × importance × relevance). See
  §8.2 formula.
- **Reflection:** periodically, agent asks itself "what 3 high-level
  questions can I ask about my recent memories?", retrieves relevant
  memories for each question, and synthesizes new, more abstract
  memories. These get written back to the stream with higher
  importance scores.
- **Planning:** generates daily plans that reference retrieved
  memories.

**The reflection loop is the single most powerful trick in the
paper** and is massively under-implemented in production systems.
Fulcrum should implement it.

### 8.6 ChatGPT Memory / Claude / Cursor / Aider

- **ChatGPT Memory**: explicit "save this" + LLM-driven automatic
  extraction. User-scoped, cross-session. Opaque implementation.
- **Claude projects**: project-scoped file/context pins, not a true
  memory system — no extraction, no decay.
- **Cursor rules / .cursorrules**: file-based, manual, no runtime
  memory across sessions by default.
- **Aider**: no cross-session memory. Each session starts fresh with
  just the repo-map and chat files.

The opportunity: **none of the incumbent coding agents have a real
multi-session memory layer.** Fulcrum can differentiate here.

---

## 9. Memory scopes and composition

### 9.1 Scope taxonomy

From various systems, the common shapes:

| Scope      | Examples                                          | Lifetime      |
| ---------- | ------------------------------------------------- | ------------- |
| turn       | "what the user just said"                         | seconds       |
| thread     | conversation history                              | hours–days    |
| session    | an agent run from start to stop                   | minutes–days  |
| workspace  | per-project / per-repo memories                   | weeks–years   |
| user       | global user preferences, API keys, writing style  | indefinite    |
| org/team   | shared team conventions, coding standards         | indefinite    |
| global     | system-level facts ("the current year is 2026")   | indefinite    |

Mem0 uses user/session/agent. Letta uses core/recall/archival
(orthogonal to scope — they're memory *tiers*). ChatGPT uses
user-global.

### 9.2 Composition

At retrieval time, multiple scopes get searched and merged:

```python
def retrieve_memory(query, workspace_id, user_id):
    candidates = []
    for scope in [WORKSPACE, USER, GLOBAL]:
        c = vector_search(query, scope=(scope, workspace_id, user_id))
        candidates += c
    return rerank(dedup(candidates))
```

**Priorities when merging:**
1. More-specific scope wins on ties (workspace > user > global).
2. Later writes override earlier ones via temporal validity.
3. Redacted items are filtered before ranking.

### 9.3 Redaction and retention

- **PII redaction** before write: run a regex + NER pass, replace
  detected entities with `[REDACTED]` tokens. Store original in
  encrypted-at-rest field gated behind explicit opt-in.
- **Retention policy** per scope: e.g. turn memory expires at end of
  turn, thread memory at end of session, workspace memory at
  user-configured TTL.
- **Forget-me API**: any memory layer must expose a delete-by-scope
  and delete-by-user operation. GDPR etc.
- **Audit log**: every read and write of memory gets logged with
  `(caller, scope, purpose, timestamp)`.

---

## 10. Code-specific retrieval (Aider, Continue, SWE-bench)

### 10.1 Aider's repo-map — what it actually sends

After the algorithm in §3.1, Aider formats the ranked tags as a
markdown outline grouped by file:

```
src/auth/jwt.ts:
⋮
│class JwtService {
│  verify(token: string): Promise<Payload>
│  sign(payload: Payload, ttl: number): string
⋮
│}

src/auth/middleware.ts:
⋮
│export function requireAuth(req, res, next) {
⋮
│}
```

The `⋮` markers indicate elided lines, keeping only the definition
signatures. Typical output is 100–300 lines for a medium repo,
fitting in ~1–4k tokens.

### 10.2 SWE-bench retrieval approaches

The canonical "given a GitHub issue, find the files that need
editing" task. Reported methods:

- **BM25 over file contents**: ~25–40% recall@5. Baseline.
- **Dense over chunks** (BGE / Voyage-code): +5–10% over BM25.
- **Hybrid BM25 + dense**: ~45–55% recall@5.
- **RepoGraph** (paper 2024): builds a symbol graph with
  import/call/inherit edges, runs PageRank personalized on the
  issue's mentioned identifiers. +10–15% over hybrid.
- **Agent-based retrieval** (Agentless, SWE-agent): iteratively asks
  LLM "which file do you want to see?", provides a file list, lets
  the LLM drill down. Dominates in recall but slow and expensive.

### 10.3 Query reformulation for code search

Raw NL queries often underperform. Common reformulations:

- **HyDE** (Hypothetical Document Embeddings): ask a small LLM to
  *write* a hypothetical function that answers the query, embed that
  *function*, retrieve by its embedding. +3–8 points on code search.
- **Query expansion**: extract identifiers from the query and add a
  BM25 OR query for each.
- **Task-type prefix** (for instruction-tuned embedders): prepend
  `Instruct: Retrieve code snippets that...` to the query.
- **Split compound queries**: "find the retry logic and its test"
  becomes two parallel queries.

### 10.4 Stacked retrieval

File → symbol → line, each with its own index:

1. Retrieve candidate *files* by hybrid search over file-summary
   embeddings.
2. Within each candidate file, retrieve candidate *symbols* by
   hybrid search over symbol-chunk embeddings.
3. Within each candidate symbol, rerank candidate *line ranges* with
   a cross-encoder.

Used in Sourcegraph Cody and (reportedly) Cursor. Gives 20–30% recall
boost over flat retrieval but is 3× more expensive.

### 10.5 Continue.dev's pipeline

- Local embedding model (default) or hosted model.
- Per-file tree-sitter chunking at function/class boundary.
- LanceDB storage with BM25 co-indexed via `fts`.
- Cross-encoder reranker optional.
- Surfaces top chunks in the `@Codebase` context provider at
  inference time.

Clean, clonable reference implementation in TypeScript.

### 10.6 Recommendation for Fulcrum

Build in this order:

1. Tree-sitter chunker (JS/TS/Python/Rust/Go/Java/C/C++, plus
   MD/JSON/YAML fallback).
2. Embedding index with Qwen3-0.6B (1024-dim) in SQLite-vec or
   sqlite + usearch.
3. BM25 via SQLite FTS5 (already exercised in the repo per the
   recent FTS5 commit).
4. RRF fusion.
5. Aider-style repo-map computed on every query (cached, PageRank
   over the symbol graph).
6. `bge-reranker-v2-m3` on top-50.
7. HyDE query reformulation (optional, behind a flag).
8. LTR ranker once we have feedback data.

---

## 11. Memory ingestion pipelines

### 11.1 Pipeline shape

```
 event source (chat turn, run log, tool output, file save)
        │
        ▼
   classifier: is this worth remembering?   ← cheap LLM or rules
        │ yes
        ▼
   extractor: produce candidate memory objects
        │
        ▼
   normalizer: canonicalize entity names, units, timestamps
        │
        ▼
   dedup: embedding sim search in existing memories
        │
        ▼
   consolidator (optional): merge w/ existing via LLM rewrite
        │
        ▼
   validator: schema + PII redaction + policy
        │
        ▼
   persist to store with metadata + audit log
```

### 11.2 Automatic vs explicit writes

- **Explicit**: agent or user calls `write_memory({...})`. High
  signal, low volume. Used for long-term facts and procedural
  knowledge.
- **Automatic**: a listener on the conversation stream runs every
  N turns, extracts candidate memories with a small LLM call, and
  writes those that pass validation. Higher recall, higher noise.

Best practice (Mem0, Letta): both, with automatic extraction being
the default and explicit writes bumping importance.

### 11.3 Quality gates

Before any memory hits the store, run:
1. **Schema validation** — required fields, types, enum values.
2. **Length limits** — body ≤ 1k chars (consolidate if longer).
3. **PII filter** — configurable; drop or redact.
4. **Toxicity / policy filter** — optional.
5. **Uniqueness** — if cosine sim >0.95 with existing memory,
   merge instead of insert.
6. **Importance threshold** — skip memories below 3/10 importance
   unless they're explicit writes.
7. **Provenance** — must have at least one source (run id, turn id,
   file path).

### 11.4 Schema

Minimum viable memory row:

```json
{
  "id": "mem_...",
  "workspace_id": "...",
  "user_id": "...",
  "scope": "workspace|user|global|thread",
  "kind": "episodic|semantic|procedural",
  "body": "The build uses pnpm with Node 20.",
  "embedding": [0.02, ...],
  "importance": 0.7,
  "t_created": "2026-04-14T12:00:00Z",
  "t_last_access": "2026-04-14T12:00:00Z",
  "t_valid_from": "2026-04-14T12:00:00Z",
  "t_valid_to": null,
  "access_count": 0,
  "source_run_id": "run_...",
  "source_turn_id": "turn_...",
  "tags": ["build", "tooling"],
  "metadata": { "language": "en", "redacted": false }
}
```

### 11.5 Decay job

Run daily / on idle:

```python
def decay_job():
    for mem in memories:
        age_days = (now - mem.t_last_access).days
        decayed_importance = mem.importance * exp(-age_days / HALF_LIFE_DAYS)
        if decayed_importance < DECAY_FLOOR and mem.access_count == 0:
            soft_delete(mem)
        else:
            mem.importance = decayed_importance
```

Also run reflection periodically (see §8.5): sample top-N memories by
importance, summarize with LLM, write new semantic memories.

---

## 12. Evaluation benchmarks

### 12.1 Retrieval quality

- **BEIR**: 18 datasets, general IR. The classic.
- **MTEB**: 56 datasets across retrieval, reranking, clustering,
  classification, STS, summarization. Current SOTA ~70 multilingual
  average (Qwen3-Embedding-8B).
- **CoIR / CoIR-2025**: 10 code retrieval tasks. Best open models
  ~78–79% average.
- **SWE-bench Lite retrieval**: issue→file, recall@5 and recall@10.
  Best methods in low 60s recall@10.
- **CrossCodeEval**: cross-file code completion, measures retrieval
  quality by downstream completion accuracy.
- **RepoEval / RepoBench**: cross-file code retrieval.

### 12.2 Memory quality

- **DMR (Deep Memory Retrieval)**: introduced by MemGPT paper. Zep
  hit 94.8%, MemGPT 93.4%.
- **LongMemEval**: long-context conversation memory.
- **LoCoMo**: long conversation dataset with memory-dependent
  questions.

### 12.3 Latency targets (interactive agent use)

| Stage              | p50 target | p95 target |
| ------------------ | ---------- | ---------- |
| Embedding a query  | 20ms       | 100ms      |
| BM25 top-100       | 10ms       | 50ms       |
| Dense top-100      | 30ms       | 150ms      |
| RRF fusion         | <1ms       | <5ms       |
| Cross-encoder rerank (top-50) | 200ms | 600ms    |
| Total retrieval    | 250ms      | 800ms      |

### 12.4 What a "good" system looks like

Rule of thumb for internal tuning:
- Recall@10 ≥ 0.85 on in-distribution test set.
- nDCG@10 ≥ 0.65 on BEIR subsample.
- Memory retrieval: given a known fact written to memory, retrievable
  in top-5 with ≥95% reliability after 100 additional memories are
  added.

---

## 13. Standards checklist for Fulcrum audit

### 13.1 MUST (for both text and code paths)

- **Hybrid retrieval**: BM25 + dense, fused via RRF. Neither alone is
  acceptable.
- **Chunk metadata**: every chunk stores `(file, start_line,
  end_line, kind, symbol?, hash, content_sha)`.
- **Reproducibility**: embedding model name + version and chunker
  version stored with each chunk so we can detect stale indexes.
- **Idempotent re-index**: deleting and re-adding a file must produce
  identical rows.
- **Tree-sitter chunking for code** in the supported language list;
  sliding-window fallback only for unsupported files.
- **Cross-encoder rerank** available as a configurable stage.
- **Provenance** on every memory row: source run/turn/file.
- **Scope enforcement**: workspace/user/global memory separation,
  tested with isolation cases (R3 audit already found a workspace
  leakage bug — this must be part of the standard test suite).
- **Soft delete + audit log** on memory writes.
- **PII redaction** pipeline at ingest.

### 13.2 SHOULD

- Matryoshka-truncatable embeddings (makes 256-dim coarse indexes
  cheap).
- Aider-style PageRank repo-map as a prompt-time context channel.
- Temporal validity on memory edges (Graphiti-style `t_valid_from /
  t_valid_to`).
- Reflection loop (Park et al. style) running on idle.
- LLM-as-judge reranker available for offline eval.
- HyDE query reformulation as an optional stage.
- Decay job with configurable half-life.
- Importance scoring at write time.
- Retrieval evaluation harness with at least one in-domain dataset.

### 13.3 Things we should probably NOT do

- **Full GraphRAG pipeline.** Leiden community detection + hierarchical
  summaries is overkill for <10k-chunk project corpora. 10–100× ingest
  cost is not defensible.
- **7B+ embedding models.** Nice on benchmarks, impossible to run on
  the target hardware. Qwen3-0.6B is the ceiling.
- **Closed-source embedders as the default.** Hosted embedders (Cohere,
  Voyage, OpenAI) can be optional, never mandatory.
- **Character-window chunking for code.** Only as fallback.
- **Over-eager auto-memory extraction** — aggressive ingestion without
  a quality gate pollutes memory fast. Require importance ≥ 3/10.
- **Single retriever (dense only).** Always fuse with BM25.
- **Stateful in-process vector stores without persistence** — must
  survive restart.
- **"One embedder for everything including dense + sparse + rerank"** —
  BGE-M3 promises this; in practice the unified model is ~10% worse on
  each axis than a specialist. Use a bi-encoder for retrieval and a
  cross-encoder for reranking.

---

## 14. Recommended tech stack (concrete — pick one per slot)

- **Text embedder:** Qwen3-Embedding-0.6B (Apache 2.0, 1024-dim,
  Matryoshka, instruction-aware). Fallback: BGE-M3.
- **Code embedder:** start with Qwen3-0.6B (shared); add
  `jina-code-embeddings-0.5B` as a second path if code-to-code recall
  proves weak in eval.
- **Chunking strategy (text):** recursive paragraph splitter, 512 tok
  target, 64 tok overlap. Split priority: `\n\n` > `\n` > `. ` > ` `.
- **Chunking strategy (code):** tree-sitter at function/class
  boundary, zero overlap, split-by-statements for oversized nodes,
  sliding 1500-char fallback for unsupported files.
- **Reranker:** `bge-reranker-v2-m3` (Apache 2.0, 570M). Rerank
  top-50 to top-10. Optional `jina-reranker-v2-base-multilingual` as
  smaller alternative.
- **Vector store:** SQLite + `sqlite-vec` (or `usearch` in-process).
  Single-file, zero-ops, works with the Fulcrum SQLite pattern
  already in place. For scale migration: Qdrant or LanceDB.
- **Sparse/BM25:** SQLite FTS5 (already in repo per recent fix) or
  Tantivy-via-rust if we need phrase queries.
- **Hybrid retrieval:** RRF (k=60) over {BM25, dense, repo-map}.
- **Code graph:** tree-sitter tag extraction + NetworkX-style
  directed graph in SQLite; PageRank with personalization for
  repo-map.
- **Memory layer:**
    - **Tiered** like Letta/MemGPT: core (in-context), working
      (session), archival (workspace + user).
    - **Scoped** like Mem0: workspace / user / global.
    - **Temporal** like Graphiti: `t_valid_from/to` edges.
    - **Decayed + reflected** like Park et al.: importance × recency ×
      relevance scoring, periodic reflection.
    - **Stored in SQLite** with the embedding via sqlite-vec, audit
      log in a separate table.
- **Ingestion pipeline:** classifier → extractor → normalizer → dedup
  → consolidator → validator → persist. Both automatic (post-turn
  hook) and explicit (tool call) paths.
- **Evaluation:** in-repo test corpus + recall@10 / nDCG@10 / memory
  retrievability test; run on every PR that touches the retrieval
  stack.

---

## 15. References

- Aider repo-map doc — https://aider.chat/docs/repomap.html
- Aider repo-map blog — https://aider.chat/2023/10/22/repomap.html
- Aider source (`aider/repomap.py`) — https://github.com/Aider-AI/aider
- Continue.dev docs — https://docs.continue.dev/
- Sourcegraph SCIP — https://sourcegraph.com/docs/code-navigation/scip
- Qwen3 Embedding paper — https://arxiv.org/abs/2506.05176
- Qwen3 Embedding repo — https://github.com/QwenLM/Qwen3-Embedding
- Qwen3-Embedding-8B model card — https://huggingface.co/Qwen/Qwen3-Embedding-8B
- BGE-M3 paper — https://arxiv.org/abs/2402.03216
- BGE-reranker-v2-m3 — https://huggingface.co/BAAI/bge-reranker-v2-m3
- E5-Mistral — https://arxiv.org/abs/2401.00368
- NV-Embed-v2 — https://huggingface.co/nvidia/NV-Embed-v2
- Nomic Embed — https://blog.nomic.ai/posts/nomic-embed-text-v1
- Mixedbread mxbai — https://www.mixedbread.ai/blog/mxbai-embed-large-v1
- Voyage code-3 — https://blog.voyageai.com/2024/12/04/voyage-code-3/
- Jina code embeddings — https://jina.ai/news/jina-code-embeddings-sota-code-retrieval-at-0-5b-and-1-5b/
- Jina reranker v2 — https://jina.ai/reranker/
- Cohere Rerank — https://docs.cohere.com/docs/rerank
- MTEB leaderboard — https://huggingface.co/spaces/mteb/leaderboard
- CoIR benchmark — https://github.com/CoIR-team/coir
- SWE-bench — https://www.swebench.com/
- RepoGraph — https://arxiv.org/abs/2410.14684
- CrossCodeEval — https://crosscodeeval.github.io/
- CodeRAG-Bench — https://arxiv.org/abs/2406.14497
- Tree-sitter docs — https://tree-sitter.github.io/tree-sitter/
- Tree-sitter query API — https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries
- Microsoft GraphRAG — https://github.com/microsoft/graphrag
- GraphRAG paper — https://arxiv.org/abs/2404.16130
- LightRAG — https://github.com/HKUDS/LightRAG
- Zep Graphiti paper — https://arxiv.org/abs/2501.13956
- Graphiti repo — https://github.com/getzep/graphiti
- Mem0 — https://github.com/mem0ai/mem0
- Letta (MemGPT) — https://github.com/letta-ai/letta
- MemGPT paper — https://arxiv.org/abs/2310.08560
- Generative Agents (Park et al.) — https://arxiv.org/abs/2304.03442
- HyDE paper — https://arxiv.org/abs/2212.10496
- RRF (Cormack et al.) — https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- Leiden algorithm — https://www.nature.com/articles/s41598-019-41695-z
- BEIR — https://github.com/beir-cellar/beir
- LoCoMo — https://arxiv.org/abs/2402.17753
- LongMemEval — https://arxiv.org/abs/2410.10813
