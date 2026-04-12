# PI Agent: State-of-the-Art Web + Memory Stack (Pi-Native First)

## Context

You run `pi` (`@mariozechner/pi-coding-agent` **v0.65.0**, profile `/home/mkh/.raise/profiles/vanilla/pi`, currently with **zero packages installed**) and want a serious setup in the spirit of `disler/pi-vs-claude-code` but without its flaws.

Your explicit priorities and constraints, in order:

1. **Web search / fetch / automation** as real first-class tools (not a bash one-liner in an agent persona, which is how disler's repo ships its "web tooling" via `firecrawl || curl` inside `.pi/agents/pi-pi/ext-expert.md`).
2. **Memory — the more critical priority.** Relevance-ranked recall, total-recall capability, fast, no context flooding, summaries-first with file paths the agent can follow for full content on demand.
3. **Reuse over reinvention.** Prefer existing, maintained Pi-native extensions to anything hand-written.
4. **Pi-native over MCP.** Use `pi install npm:...` extensions whenever one exists; only fall back to `pi-mcp-adapter` when the ecosystem has a clear gap.
5. **Include damage-control rules as part of this plan**, not as a later phase.
6. **Global install** with per-project overrides where each project can have its own vault path.

### Why the disler repo doesn't already solve this

- **No real memory.** What it calls memory is `pi.appendEntry` audit logs (write-only in that codebase) plus per-process JSON session files that are **deleted on every Pi session start** (`extensions/agent-team.ts` `session_start` handler unlinks `.pi/agent-sessions/*.json`). There is no read API, no relevance ranking, no persistence across `pi` restarts.
- **No web tools.** Zero `pi.registerTool({name:"web_..."...})` calls anywhere in the 16 extensions. Web access is a `firecrawl ... || curl ...` pipeline embedded in an agent system prompt, with no SSRF protection, no allowlist, no cache, and output clobbering a shared `/tmp` path.
- **Damage-control has real value.** Its ~80-pattern `damage-control-rules.yaml` (rm, git reset, AWS/GCP/Firebase/Vercel/Netlify destroyers, SQL DROP/TRUNCATE, `.env`/`.ssh`/`*.pem` zero-access) is the one genuinely reusable artifact. But the extension that enforces it uses naïve `command.includes(zap)` substring matching — `echo ".env is ..."` gets blocked, `python -c "open('package-lock.json','w')"` slips through. Keep the rules, drop the enforcer.

## The Pi-Native Ecosystem Discovery

A fresh npm search on `keywords:pi-package` turned up a more mature ecosystem than disler's repo suggests. The critical finds:

| Need | Pi-native package | Notes |
|---|---|---|
| **Memory** | **`@touchskyer/memex`** v0.1.28 | Zettelkasten markdown cards in `~/.memex/cards/`, 8 Pi tools + auto-recall hook + slash commands. Uses `@modelcontextprotocol/sdk` + `gray-matter` + `zod`. Cross-client: same vault works in Claude Code, Cursor, Codex, Pi. CLI: `memex search/read/write/links/archive/serve/sync`. Install: `npm install -g @touchskyer/memex && pi install npm:@touchskyer/memex`. |
| **Web search + fetch + PDF + YouTube + GitHub clone** | **`pi-web-access`** v0.10.6 (nicopreme) | Perplexity-backed search; HTML→MD via Mozilla Readability + Turndown; PDF via `unpdf`; YouTube/video understanding; GitHub repo cloning. Clean extraction, not a bash pipeline. |
| **Free zero-key web search** | **`@apmantza/greedysearch-pi`** v1.7.6 | Multi-engine AI search (Perplexity, Bing Copilot, Google AI) via browser automation, **no API keys**. Optional Gemini synthesis. Good as fallback. |
| **Ollama-hosted search + fetch** | **`@ollama/pi-web-search`** v0.0.5 (official Ollama) | Uses Ollama's hosted web search/fetch APIs. Free if you use Ollama. |
| **Permission / bash / file guard** | **`pi-guard`** v1.1.0 | General-purpose permission system with extensible matchers for bash and file tools. Pi-native, right shape for the damage-control ruleset. |
| **Secret-leak prevention** | **`pi-secret-guard`** | Hybrid regex + LLM review for secrets/API keys/credentials. |
| **MCP bridge (for the remaining gaps)** | **`pi-mcp-adapter`** v2.3.4 (nicopreme) | Uses official `@modelcontextprotocol/sdk@^1.25.1`. Single adapter that exposes any MCP server as native Pi tools. Reserved for targeted gaps only. |
| **Subagents (optional)** | `pi-subagents` v0.13.0, `pi-teams` v0.9.14 | Delegation / parallel / chains. Not required by this plan but worth mentioning. |

## Memory Decision — Memex (with one eyes-open tradeoff)

Memex matches every line of your spec **except one**. Here's the honest scorecard:

| Your requirement | Memex |
|---|---|
| Files on disk, agent can read full content on demand | **Yes.** Atomic markdown cards in `~/.memex/cards/`, openable in Obsidian, greppable from terminal, optionally git-synced. |
| Summary-first recall, no context flooding | **Yes.** Recall surfaces card titles + slugs + snippets + `[[backlinks]]`; agent calls `read` only on the cards it decides it needs. |
| Total recall | **Yes.** `memex search` with no query lists all cards; `memex links` gives the full link graph; timeline UI at `memex serve` (`localhost:3939`). |
| File paths in results | **Yes.** Every result carries a slug that maps to a real `.md` path — that's the whole model. |
| Native Pi tool, not a prompt hack | **Yes.** Pi extension registers 8 tools and an auto-recall hook that runs at session start to pre-load relevant cards *before* the user's first turn. |
| Fast | **Yes.** Pure filesystem + keyword search, sub-100ms on personal-scale vaults. |
| Relevance-ranked retrieval (semantic / embeddings) | **NO.** Memex is explicitly "no vector database, no embeddings — just markdown files." It relies on keyword search + the Zettelkasten bidirectional-link graph + atomic-note discipline. That's a defensible design choice (inspired by Niklas Luhmann's 90,000-card system) but it is *not* configurable across backends. |

### The configurability question

You asked for a system where the embedding backend is swappable (local sentence-transformers / Ollama / OpenAI / plain FTS) without hand-rolling it. The only memory system I found that ships all four backends first-class is `basic-memory` (`basicmachines-co/basic-memory`), which is not a Pi-native extension — it's an MCP server (`uvx basic-memory mcp`).

**The recommendation handles this as a two-track design:**

- **Primary track — Memex (pi-native).** Install it, use it day one. Zettelkasten discipline + auto-recall + link graph is *surprisingly* effective in practice; 90k-card systems operated productively for decades without embeddings. Markdown + grep + bidirectional links cover more than people expect.
- **Secondary track — Basic Memory as MCP fallback.** If semantic recall proves necessary after real use, wire `basic-memory` in through `pi-mcp-adapter`. Basic Memory supports plain FTS, local sentence-transformers, Ollama, and OpenAI as swappable embedding backends — exactly the "configurable whenever, however" shape you asked for. Its vault is also just a directory of markdown files, so you can point it at a sibling directory (`~/.memex/cards/` read-only for indexing, or a dedicated `~/.pi-memory/`) without migrating.

The two stores do not need to merge. Memex is where the agent writes atomic knowledge cards. Basic Memory (if activated later) is where the agent indexes larger corpora — scraped web pages, dumped docs — and can be queried with semantic retrieval.

This is a "start minimal, earn complexity" decision. I explicitly flag it here so you make the call with eyes open.

## Web Tools Decision — Layered, Native-First

Pi-native, install day one:

1. **`pi-web-access`** — default web search (Perplexity backend), URL fetch with Readability→Markdown, PDF extraction, YouTube, GitHub repo cloning. Covers ~80% of day-to-day web needs with one install.
2. **`@apmantza/greedysearch-pi`** — zero-API-key multi-engine fallback. Useful when Perplexity credits run out or when you want a second opinion from Bing/Google AI.
3. **`@ollama/pi-web-search`** — opt-in only if you run Ollama. Redundant with (1), include only if you want a fully-local option.

Gaps (no pi-native equivalent) — fill via `pi-mcp-adapter`:

4. **`@playwright/mcp`** (Microsoft, 30k+ stars) — interactive browser automation via accessibility tree. No pi-native Playwright wrapper exists today; this is the right gap-fill use of the MCP bridge. Caveat: accessibility snapshots can emit ~100k tokens on complex pages — mitigations below.
5. **`tavily-mcp` / `exa-mcp-server` / `firecrawl-mcp`** — only if `pi-web-access`'s Perplexity backend proves insufficient or you want Tavily's 1000 free searches/month, Exa's semantic/`get_code_context_exa`, or Firecrawl's crawl + JSON-schema extraction features. Install as a Phase 2 decision after dogfooding the native stack.

### Mitigating the Playwright-MCP context-flood footgun

Three measures bake into the plan:

1. Launch with `--browser firefox` in the adapter config — lighter accessibility snapshots than Chromium.
2. Prefer `browser_evaluate` (direct DOM query) over raw `browser_snapshot` when the target is known.
3. **Pipe scraped content into Memex.** Every Playwright/Firecrawl/pi-web-access page save goes to `~/.memex/cards/web-cache/<slug>.md`. The agent then gets `{title, slug, snippet}` at recall time and reads full content only on demand — the same pattern that solves context-flooding for the memory layer solves it for the web layer. Zero extra code.

## Damage-Control Decision — pi-guard + Disler's Ruleset

`pi-guard` v1.1.0 is a Pi-native permission system with extensible bash/file matchers. It replaces disler's hand-rolled `extensions/damage-control.ts` enforcer (which uses naïve substring matching and has documented false-positive/false-negative bugs).

The actual *value* in disler's repo is the ruleset content: ~80 regex patterns covering destructive ops across rm/git/AWS/GCP/Firebase/Vercel/Netlify/Wrangler/SQL plus zero-access/read-only/no-delete path lists. That YAML file is usable as-is or easy to transliterate into pi-guard's matcher format.

Plan of action:

1. Install `pi-guard`.
2. Pull the raw `.pi/damage-control-rules.yaml` from `disler/pi-vs-claude-code` into `~/.pi/agent/guard-rules/damage-control.yaml`.
3. Read `pi-guard`'s matcher-config README on first install and adapt the rules. If the schemas align, it's a copy-paste. If not, convert by category (`bashToolPatterns` → pi-guard bash matchers; `zeroAccessPaths` + `readOnlyPaths` + `noDeletePaths` → pi-guard file matchers). No custom TypeScript needed.
4. Add `pi-secret-guard` on top — dedicated secret-leak protection (hybrid regex + LLM review) that pi-guard doesn't cover.

If `pi-guard`'s matcher DSL turns out too restrictive to express the full disler ruleset, the fallback is **one small extension** (~50 lines) that loads the YAML and registers `before_tool_call` matchers with proper regex (not substring) and tests. That is still vastly less custom code than disler's 500-line `damage-control.ts`. Flag this as a decision point, not a commitment.

## Scope Decision — Global + Per-Project Vault Override

Per your answer: install everything globally into the user Pi profile, but make the memory vault path resolvable per-directory so each project can have its own notes if desired.

- **Global Pi extensions**: installed via `pi install npm:... ` (no `-l` flag) → written to `/home/mkh/.raise/profiles/vanilla/pi/agent/settings.json`'s `packages` array.
- **Global default vault**: `~/.memex/cards/` (memex default).
- **Per-project override**: memex honors a `MEMEX_HOME` env var (verify on first install). Fish shell users: add a directory-scoped autoload to `~/.config/fish/conf.d/` or use a per-project `.envrc` with direnv. Concrete recipe goes in post-install verification.

## Concrete Install Sequence

All read-only actions until you approve the plan. On approval:

```bash
# 0. Pre-reqs (already present on this box)
which pi        # /run/user/1000/fnm_multishells/.../bin/pi  -> 0.65.0
which bun uvx   # /home/mkh/.bun/bin/bun, /usr/bin/uvx
node --version  # (confirm >= 18 for memex)

# 1. Memory — pi-native, primary
npm install -g @touchskyer/memex
pi install npm:@touchskyer/memex

# 2. Web tools — pi-native
pi install npm:pi-web-access
pi install npm:@apmantza/greedysearch-pi
# optional if Ollama user:
# pi install npm:@ollama/pi-web-search

# 3. Safety — pi-native
pi install npm:pi-guard
pi install npm:pi-secret-guard

# 4. MCP bridge — for the gap (Playwright)
pi install npm:pi-mcp-adapter

# 5. Wire MCP gap-fill servers
#    Config file path: TBD on first install; check pi-mcp-adapter README.
#    Minimum entry:
#      playwright: { command: "npx",
#                    args: ["-y", "@playwright/mcp@latest", "--browser", "firefox"] }
#    Optional later: tavily-mcp, exa-mcp-server, firecrawl-mcp.

# 6. Damage-control ruleset
mkdir -p ~/.pi/agent/guard-rules
curl -fsSL https://raw.githubusercontent.com/disler/pi-vs-claude-code/main/.pi/damage-control-rules.yaml \
  -o ~/.pi/agent/guard-rules/damage-control.yaml
#    Then adapt to pi-guard's matcher format per its README.

# 7. Shell env for API keys (Pi does NOT auto-load .env — known gotcha)
#    Add PERPLEXITY_API_KEY (pi-web-access) plus any MCP-layer keys to fish env.
```

## Critical Files / Paths

- `/home/mkh/.raise/profiles/vanilla/pi/agent/settings.json` — Pi user settings; `packages` array gets populated by `pi install` calls. Currently contains only `lastChangelogVersion`, empty `packages`, `showHardwareCursor: false`.
- `/home/mkh/.raise/profiles/vanilla/pi/agent/skills/` — existing user skills (`caveman`, `caveman-compress`, `find-skills`, `playwright-cli`). Will add `memory-protocol/SKILL.md` optionally.
- `~/.memex/cards/` — memex vault (pi-native, global default).
- `~/.pi/agent/guard-rules/damage-control.yaml` — pi-guard rule source (derived from disler's YAML).
- `pi-mcp-adapter` MCP config file — path confirmed on first install (likely `~/.pi/agent/mcp-servers.json` or similar).
- `~/.config/fish/conf.d/pi.fish` — API key exports so Pi sees them without manual `source`.

## Reused Pieces (not reinvented)

| Layer | Upstream component | Why this one |
|---|---|---|
| Memory (primary) | `@touchskyer/memex` | Pi-native, markdown + bidirectional links, auto-recall hook, cross-client shared vault, CLI + MCP both. |
| Memory (optional semantic fallback) | `basic-memory` via `pi-mcp-adapter` | Swappable embeddings (sentence-transformers / Ollama / OpenAI / FTS). Only if keyword + links prove insufficient. |
| Web search + fetch + PDF + GitHub + YouTube | `pi-web-access` | Pi-native, Readability-based clean extraction, covers many sub-tools in one install. |
| Free zero-key search fallback | `@apmantza/greedysearch-pi` | Pi-native, browser-automation multi-engine, no API budget. |
| Browser automation | `@playwright/mcp` via `pi-mcp-adapter` | Official Microsoft MCP server, 30k+ stars, no pi-native equivalent. |
| Pi → MCP bridge | `pi-mcp-adapter` | Official MCP SDK underneath; single adapter unlocks the whole MCP ecosystem for targeted gaps. |
| Permission guard | `pi-guard` | Pi-native replacement for disler's buggy substring-matching enforcer. |
| Secret-leak guard | `pi-secret-guard` | Pi-native, hybrid regex + LLM, no coverage overlap with pi-guard. |
| Damage-control *ruleset* | `disler/pi-vs-claude-code/.pi/damage-control-rules.yaml` | The one reusable artifact from that repo — ~80 curated regexes for rm/git/cloud-destroyers/SQL. |

## What This Plan Explicitly Does NOT Do

- Does not install `basic-memory` on day one. Deferred to "if semantic recall proves necessary."
- Does not install Tavily/Exa/Firecrawl MCP servers on day one. Deferred to "if `pi-web-access`'s Perplexity backend proves insufficient."
- Does not write a custom memory extension. Memex covers it.
- Does not write a custom web-tool extension. `pi-web-access` covers it.
- Does not copy disler's `damage-control.ts` enforcer (it has documented bugs). Uses `pi-guard` instead; only the rule data is imported.
- Does not install `pi-subagents`/`pi-teams`. You did not ask for orchestration; keep scope tight.

## Verification

1. `pi list` — confirm all installed packages are present: `@touchskyer/memex`, `pi-web-access`, `@apmantza/greedysearch-pi`, `pi-guard`, `pi-secret-guard`, `pi-mcp-adapter`.
2. Launch `pi`, inspect tool listing — confirm memex tools (`recall`, `write_card`, `read_card`, `links`, …), `pi-web-access` tools (`web_search`, `fetch_url`, `extract_pdf`, …), and MCP-bridged Playwright tools (`browser_navigate`, `browser_evaluate`, …).
3. Memory smoke test: `pi "write a memex card titled 'pi-stack-setup' with the key decisions from this plan, then recall anything about 'pi stack' and summarize the top card."` — round-trip should return title + snippet, then full content on explicit read.
4. Web smoke test: `pi "search the web for 'memex zettelkasten pi-package' with pi-web-access, fetch the top GitHub README, extract the Install section, and save the cleaned markdown as a memex card under web-cache/."` — confirm no raw HTML floods the context.
5. Guard smoke test: `pi "bash: rm -rf /tmp/foo-should-be-blocked"` — confirm `pi-guard` blocks it (dry-run rule match). Then `pi "bash: echo '.env is a config file'"` — confirm it does NOT false-positive like disler's substring-matcher would.
6. Secret-guard smoke test: attempt to `write` a file containing a fake AWS key — confirm `pi-secret-guard` flags/blocks.
7. Playwright smoke test: `pi "open github.com/basicmachines-co/basic-memory with the browser, read the accessibility tree, tell me the main headings."` — confirm adapter-routed tool is used, not bash+curl.
8. Per-project vault test: `cd /tmp/test && MEMEX_HOME=/tmp/test/.memex pi "write a memex card 'scoped'"` — confirm the card lands in `/tmp/test/.memex/cards/`, not `~/.memex/cards/`.
9. File-path total-recall test: `ls ~/.memex/cards/` — confirm your notes exist as real `.md` files you can `cat`, grep, and open in any editor.

## Open Items To Resolve On First Install

- **Exact MCP adapter config path and schema** — read `pi-mcp-adapter`'s README on install; plan assumes standard `mcpServers` shape.
- **pi-guard matcher DSL expressiveness** — determines whether disler's ruleset transliterates cleanly or needs a tiny helper extension. Flagged decision point.
- **memex per-project vault env var** — verify `MEMEX_HOME` (or equivalent) exists. If not, use symlinks per project or fall back to the global vault with project-prefixed slugs.
- **API keys inventory** — `PERPLEXITY_API_KEY` for `pi-web-access`; optional `TAVILY_API_KEY`/`EXA_API_KEY`/`FIRECRAWL_API_KEY` for the deferred MCP gap-fills; `GEMINI_API_KEY` for `greedysearch-pi` synthesis (optional).
