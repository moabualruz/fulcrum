# R4 — Agent Definition Standards

> Research task R4. Survey of how modern agent frameworks define an "agent" as
> a first-class object: file format, configuration surface, capability spec,
> and where ecosystems converge or diverge. Synthesises a minimum viable agent
> definition and a Fulcrum audit checklist.
>
> Date: 2026-04-14
> Scope: ~12 frameworks + emerging standards (A2A, AGNTCY / OASF, AGENTS.md).

---

## 1. Per-framework deep-dives

### 1.1 OpenAI Agents SDK

The OpenAI Agents SDK (`openai-agents-python`) is the production successor to
the experimental Swarm project. It treats the agent as a first-class dataclass
that composes model, instructions, tools, handoffs, and guardrails.

**`Agent` class fields** (authoritative surface):

| Field                 | Type                        | Required | Purpose                                                                 |
|-----------------------|-----------------------------|----------|-------------------------------------------------------------------------|
| `name`                | `str`                       | yes      | Human-readable identifier; also used for tracing.                       |
| `instructions`        | `str \| Callable[..., str]` | yes      | System prompt. Callable form receives run context for dynamic prompts.  |
| `model`               | `str \| Model`              | no       | Defaults to the SDK's global default (typically `gpt-4.1` or newer).    |
| `model_settings`      | `ModelSettings`             | no       | `temperature`, `top_p`, `tool_choice`, `parallel_tool_calls`, etc.      |
| `tools`               | `list[Tool]`                | no       | Registered via `@function_tool` decorator or explicit `Tool` subclass.  |
| `handoffs`            | `list[Agent \| Handoff]`    | no       | Specialist agents this agent may transfer control to.                   |
| `handoff_description` | `str`                       | no       | Shown to *other* agents when they consider handing off to this one.     |
| `output_type`         | `Type`                      | no       | Pydantic / dataclass / `TypedDict` for structured final output.         |
| `input_guardrails`    | `list[InputGuardrail]`      | no       | Run on first user input, can short-circuit.                             |
| `output_guardrails`   | `list[OutputGuardrail]`     | no       | Run on final agent output.                                              |
| `prompt`              | `dict \| Callable`          | no       | Responses API prompt config (server-side prompt templates).             |
| `mcp_servers`         | `list[MCPServer]`           | no       | Tool sources exposed via Model Context Protocol.                        |
| `hooks`               | `AgentHooks`                | no       | Lifecycle callbacks: `on_start`, `on_end`, `on_handoff`, `on_tool_*`.   |
| `tool_use_behavior`   | `str \| Callable`           | no       | `"run_llm_again"` (default) or `"stop_on_first_tool"`.                  |
| `reset_tool_choice`   | `bool`                      | no       | Prevents tool-choice loops (default `True`).                            |

**Handoffs.** A handoff is modelled as a transfer of conversation control:
the target agent receives the full message history and takes over. Handoffs
can be declared by passing `Agent` objects directly, or wrapped with
`Handoff(...)` to customise the generated tool name, description, or
input filter (to strip or summarise history before transfer).

**Tool registration.** Tools are Python callables decorated with
`@function_tool`. The SDK introspects the signature, docstring, and type
annotations to derive the JSON schema, including argument descriptions from
the docstring. Tools may be sync or async and may accept a `RunContextWrapper`
for access to per-run state.

**Agent-as-tool.** `agent.as_tool(tool_name=..., tool_description=...)`
exposes a full sub-agent as a single tool the parent can call. This is the
"manager pattern" the docs recommend for hierarchical orchestration.

**Tracing, evals, guardrails.** Tracing is automatic: the SDK emits
`Trace` → `Span` objects that are consumed by `openai.trace` exporters or the
OpenAI dashboard. Guardrails are first-class: `InputGuardrail` and
`OutputGuardrail` subclasses return `GuardrailFunctionOutput` with a
`tripwire_triggered` flag. Evals live in a parallel library (`openai-evals`)
but agents expose hooks that make it easy to capture runs for replay.

**Key observation.** The OpenAI SDK is code-first. There is no YAML or JSON
schema for an agent. Configuration is hot-reloaded by re-executing the
module. Versioning is left to the user (typically via git).

---

### 1.2 Claude Code subagents

Claude Code subagents are arguably the most mature Markdown-based agent
definition format in production today. The file lives at
`.claude/agents/<name>.md` (project scope) or `~/.claude/agents/<name>.md`
(user scope). The format is YAML frontmatter + Markdown system prompt.

**Scope precedence** (highest to lowest):

1. Managed settings (organisation-wide, via enterprise deployment)
2. `--agents` CLI flag (JSON, session-only)
3. `.claude/agents/` in the project
4. `~/.claude/agents/` (user-global)
5. Plugin `agents/` directory

**Full frontmatter schema** (from the current Claude Code docs):

| Field             | Required | Purpose                                                                                   |
|-------------------|----------|-------------------------------------------------------------------------------------------|
| `name`            | yes      | Unique identifier, lowercase + hyphens.                                                    |
| `description`     | yes      | Tells Claude *when* to delegate to this subagent. Matched against the task.                |
| `tools`           | no       | Whitelist of tools. If omitted, inherits all tools.                                        |
| `disallowedTools` | no       | Blacklist, applied after the inherited/whitelisted set.                                    |
| `model`           | no       | `sonnet`, `opus`, `haiku`, a full model ID, or `inherit` (default).                        |
| `permissionMode`  | no       | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`.                  |
| `maxTurns`        | no       | Hard ceiling on agentic turns before forced stop.                                          |
| `skills`          | no       | Skills to load into this subagent's context at startup (injected, not dynamically loaded). |
| `mcpServers`      | no       | MCP servers available; each entry is a server-name reference or inline config.             |
| `hooks`           | no       | Subagent-scoped lifecycle hooks.                                                           |
| `memory`          | no       | `user`, `project`, or `local` — persistent memory directory for cross-session learning.    |
| `background`      | no       | `true` to always run as a background task.                                                 |
| `effort`          | no       | `low`, `medium`, `high`, `max` — overrides session effort level (Opus 4.6 only for `max`). |
| `isolation`       | no       | `worktree` to run in a temporary git worktree for fully isolated file state.               |
| `color`           | no       | UI colour tag: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`.       |
| `initialPrompt`   | no       | Auto-submitted as first user turn when run as main session agent.                          |

**Body.** Everything after the frontmatter is the subagent's system prompt.
The subagent receives **only** this prompt plus minimal environment details
(working directory, platform) — it does not inherit the main conversation's
Claude Code system prompt. This keeps token costs low and behaviour sharp.

**Dispatch.** The main-session model reads the `description` fields of all
loaded subagents and picks one when a task matches. Users can also force a
dispatch with `"Use the <name> agent to ..."`. The built-in `Task` tool is
what actually spawns the subagent — it accepts a task description and returns
a summary, nothing more, which is the core context-preservation design.

**Built-in subagents** (inherit the parent's permissions with added tool
restrictions): **Explore** (Haiku, read-only), **Plan** (read-only, used in
plan mode), **general-purpose** (all tools), plus helpers like
`statusline-setup` and `Claude Code Guide`.

**Anthropic "Agent SDK".** Anthropic's `claude-agent-sdk` (formerly the
Claude Code SDK) exposes the same concepts programmatically. Subagents
defined as Markdown files are automatically discovered; you can also define
them inline via the `--agents` JSON flag or the SDK's options object.

**Skills ≠ subagents.** Skills are directories containing a `SKILL.md` that
give Claude *capabilities* (domain knowledge + scripts). Subagents are
*delegatable workers* with their own context window. A subagent can *load*
skills, but skills are not themselves agents. See §3 for full disentangling.

---

### 1.3 LangChain / LangGraph

The current LangChain recommendation is `create_agent` (the LangGraph
successor to `create_react_agent`). It is code-first, returns a compiled
LangGraph graph, and composes with the broader LangGraph runtime for
persistence, interruption, and human-in-the-loop.

**`create_agent` parameters:**

| Field            | Purpose                                                                                    |
|------------------|---------------------------------------------------------------------------------------------|
| `model`          | Model identifier (`"openai:gpt-5"`) or provider-specific chat model instance.               |
| `tools`          | List of `@tool`-decorated functions or `BaseTool` subclasses. Empty list is allowed.        |
| `system_prompt`  | `str` or `SystemMessage`; supports provider features (e.g. Anthropic prompt caching).      |
| `name`           | Optional `snake_case` identifier for multi-agent systems.                                   |
| `response_format`| `ToolStrategy` / `ProviderStrategy` for structured output.                                  |
| `state_schema`   | `TypedDict` extending `AgentState` to add custom state fields beyond `messages`.            |
| `context_schema` | Runtime context definition (read-only, passed at invocation).                               |
| `checkpointer`   | Persistence backend for state across turns/sessions.                                        |
| `store`          | Long-term key/value store for memory across threads.                                        |
| `middleware`     | Extensible middleware chain for cross-cutting concerns (auth, logging, caching).            |
| `interrupt_before` / `interrupt_after` | Node-level breakpoints for human-in-the-loop workflows.                           |
| `debug`          | Verbose execution tracing.                                                                  |

**No declarative format.** LangGraph is entirely code-driven. There is no
YAML/JSON agent spec. LangSmith captures traces that include the *effective*
agent configuration at runtime (model, tools, prompt hash) but does not
declare agents — it only observes them.

**LangGraph Cloud / Platform.** Agents are deployed as graphs via
`langgraph.json`, which declares graphs, dependencies, and environment
variables — but the agent *itself* is still Python code. `langgraph.json`
is closer to a deployment manifest than an agent definition.

---

### 1.4 CrewAI (+ `agents.yaml` spec)

CrewAI is unique in that it treats declarative YAML as the *recommended*
way to define agents and tasks. The Python layer is a thin binding.

**`Agent` class fields** (29 attributes as of 2026):

| Field                     | Default       | Purpose                                                         |
|---------------------------|---------------|-----------------------------------------------------------------|
| `role`                    | —             | Required. Short role name ("Senior Researcher").                |
| `goal`                    | —             | Required. Individual objective that drives decisions.          |
| `backstory`               | —             | Required. Persona / context / personality.                      |
| `llm`                     | `gpt-4`       | Model identifier or `LLM` instance.                              |
| `tools`                   | `[]`          | `BaseTool` subclasses.                                           |
| `function_calling_llm`    | `None`        | Separate (often cheaper) model for tool calls.                   |
| `verbose`                 | `False`       | Detailed execution logs.                                         |
| `allow_delegation`        | `False`       | May delegate to other agents in the crew.                        |
| `max_iter`                | `20`          | Hard cap on reasoning iterations.                                |
| `max_rpm`                 | `None`        | Rate limit in requests per minute.                               |
| `max_execution_time`      | `None`        | Wall-clock timeout (seconds).                                    |
| `max_retry_limit`         | `2`           | Retries on tool/LLM error.                                       |
| `cache`                   | `True`        | Cache tool executions.                                           |
| `respect_context_window`  | `True`        | Auto-summarise history to fit.                                   |
| `multimodal`              | `False`       | Enable image/video inputs.                                       |
| `inject_date`             | `False`       | Inject current date into every task.                             |
| `date_format`             | `%Y-%m-%d`    | Date injection format.                                           |
| `reasoning`               | `False`       | Run a planning pass before execution.                            |
| `max_reasoning_attempts`  | `None`        | Planning iteration limit.                                        |
| `step_callback`           | `None`        | Called after each step (used for observability).                 |
| `system_template`         | `None`        | Custom system prompt template.                                   |
| `prompt_template`         | `None`        | Custom input format template.                                    |
| `response_template`       | `None`        | Custom response format template.                                 |
| `embedder`                | `None`        | Embedding config dict (used by knowledge sources / memory).      |
| `knowledge_sources`       | `None`        | Domain-specific knowledge bases.                                 |
| `use_system_prompt`       | `True`        | Whether to emit `system` role messages.                          |
| `memory`                  | (via crew)    | Memory is enabled at the crew level and inherited.               |

**YAML format (`config/agents.yaml`):** One top-level key per agent. Variable
substitution via `{placeholder}` replaced from `crew.kickoff(inputs=...)`.

```yaml
# config/agents.yaml
researcher:
  role: >
    Senior Research Analyst for {topic}
  goal: >
    Uncover cutting-edge developments in {topic} and produce a concise brief.
  backstory: >
    You're a seasoned analyst with a knack for spotting trends and
    translating complex findings into actionable insights.
  llm: openai/gpt-4.1
  tools:
    - SerperDevTool
    - WebsiteSearchTool
  allow_delegation: false
  verbose: true
  max_iter: 15
  max_rpm: 20

writer:
  role: >
    Technical Content Writer
  goal: >
    Write clear, compelling articles about {topic} based on research briefs.
  backstory: >
    You transform dense technical research into readable prose without
    losing the nuance experts care about.
  llm: anthropic/claude-sonnet-4.5
  allow_delegation: false
  verbose: true
```

```yaml
# config/tasks.yaml
research_task:
  description: >
    Research the latest developments in {topic}. Focus on the last 6 months.
    Identify at least 5 notable advances and summarise each in one paragraph.
  expected_output: >
    A markdown-formatted brief with 5 sections, one per advance.
  agent: researcher

write_task:
  description: >
    Using the research brief, write a 1200-word article about {topic}.
  expected_output: >
    A polished markdown article with title, introduction, 5 body sections,
    and a conclusion.
  agent: writer
  context:
    - research_task
```

```python
from crewai import Agent, Crew, Task, Process
from crewai.project import CrewBase, agent, task, crew

@CrewBase
class ResearchCrew:
    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def researcher(self) -> Agent:
        return Agent(config=self.agents_config["researcher"])

    @agent
    def writer(self) -> Agent:
        return Agent(config=self.agents_config["writer"])

    @task
    def research_task(self) -> Task:
        return Task(config=self.tasks_config["research_task"])

    @task
    def write_task(self) -> Task:
        return Task(config=self.tasks_config["write_task"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=[self.researcher(), self.writer()],
            tasks=[self.research_task(), self.write_task()],
            process=Process.sequential,
            memory=True,
            verbose=True,
        )
```

CrewAI's YAML is the clearest prior art for anyone designing a declarative
agent format: it nails the role/goal/backstory triad, supports tool lists,
model binding, delegation flags, and rate limits.

---

### 1.5 AutoGen / AG2

Microsoft's AutoGen split in 2025: `microsoft/autogen` continues as the
official project (now v0.4+ with an async core), and `ag2ai/ag2` (formerly
`pyautogen`) is a community fork that kept the v0.2 API and added its own
extensions. Both expose an `AssistantAgent` class.

**`AssistantAgent` fields (autogen v0.4+):**

| Field                     | Purpose                                                            |
|---------------------------|--------------------------------------------------------------------|
| `name`                    | Required. Unique agent name.                                       |
| `model_client`            | Required. `ChatCompletionClient` instance (OpenAI, Azure, etc.).   |
| `system_message`          | System prompt. Defaults to a generic helpful-assistant text.       |
| `tools`                   | List of tool functions / `Tool` instances.                         |
| `workbench`               | Tool workbench (alternative to `tools` for MCP integration).       |
| `handoffs`                | List of `Handoff` objects or target agent names.                   |
| `model_context`           | Conversation context manager (buffered / token-limited / etc.).    |
| `description`             | Used by routers/GroupChat to decide when to pick this agent.       |
| `reflect_on_tool_use`     | Run a self-reflection turn after tool use.                         |
| `tool_call_summary_format`| Template for summarising tool results back to the model.           |
| `memory`                  | List of memory implementations consulted each turn.                |

**Declarative configs.** v0.4+ supports `dump_component()` /
`load_component()` for serialising agents to JSON. The format has
`provider`, `component_type`, `version`, and a nested `config` with the
model client, tools, and handoffs. This is primarily used for AutoGen
Studio (the UI) but is a first-party serialisation format. Issue #5064
tracks extending this to group chats.

**`GroupChat` / `RoundRobinGroupChat` / `SelectorGroupChat`.** These are
orchestration containers, not agents. They take a list of participants and
a termination condition. `SelectorGroupChat` uses an LLM to route.

**AG2 divergence.** AG2 kept the older `ConversableAgent` / `AssistantAgent`
/ `UserProxyAgent` API. It is more YAML-friendly in community tooling but
has no Microsoft-backed declarative spec.

---

### 1.6 Swarm (OpenAI experimental)

Swarm is the pedagogical precursor to the OpenAI Agents SDK. The `Agent`
dataclass has five fields:

| Field          | Type                        | Default               |
|----------------|-----------------------------|-----------------------|
| `name`         | `str`                       | `"Agent"`             |
| `model`        | `str`                       | `"gpt-4o"`            |
| `instructions` | `str \| Callable[..., str]` | `"You are ..."`       |
| `functions`    | `list[Callable]`            | `[]`                  |
| `tool_choice`  | `str \| None`               | `None`                |

**Handoffs in Swarm.** A function returns an `Agent` object; execution
transfers to the returned agent. Advanced form: return a `Result` with
`value`, `agent`, and `context_variables` to simultaneously produce a
reply, transfer control, and update shared state.

Swarm is worth studying precisely because it is minimal: five fields and one
pattern (functions returning agents) cover most multi-agent coordination.

---

### 1.7 Smolagents (Hugging Face)

Smolagents from Hugging Face is intentionally tiny (~1k lines). Two agent
classes: `CodeAgent` (writes Python code as its action space) and
`ToolCallingAgent` (classic JSON-tool-calling loop).

| Field              | Purpose                                                             |
|--------------------|---------------------------------------------------------------------|
| `tools`            | List of `Tool` instances.                                           |
| `model`            | Model backend (`InferenceClientModel`, `LiteLLMModel`, etc.).       |
| `max_steps`        | Iteration cap.                                                       |
| `system_prompt`    | Overridable system prompt (default has ReAct/Code templates).        |
| `additional_authorized_imports` | Whitelist for sandboxed Python (CodeAgent only).        |
| `planning_interval`| Force a planning step every N iterations.                            |
| `verbosity_level`  | Logging verbosity.                                                   |
| `managed_agents`   | List of child agents the parent can delegate to (multi-agent).       |

Tools inherit from a simple `Tool` base class with `name`, `description`,
`inputs` (dict of schemas), and `output_type`. Tools can also be loaded from
MCP servers, LangChain, or Hugging Face Spaces. There is no declarative
format — everything is code — but the `push_to_hub` integration effectively
versions agents as Hub artifacts.

---

### 1.8 Letta / MemGPT

Letta (formerly MemGPT) treats memory as the primary axis of agent
definition. An agent is, at its core, a system prompt *plus* a set of
memory blocks that are pinned into the context window.

**Memory block fields:**

| Field         | Purpose                                                                  |
|---------------|--------------------------------------------------------------------------|
| `label`       | Unique identifier (`persona`, `human`, etc.).                            |
| `description` | Purpose of the block (guides the agent's read/write decisions).           |
| `value`       | The string content currently stored in the block.                         |
| `limit`       | Character cap — how much of the context window the block can occupy.     |
| `read_only`   | Boolean, default `false`, prevents the agent from editing.                |

**Standard blocks.** `persona` stores the agent's self-concept (inherited
from the MemGPT paper). `human` stores what the agent knows about the user.
Agents can create and destroy blocks at will via their memory tools.

**Agent creation (JSON):**

```json
{
  "name": "billing-assistant",
  "model": "openai/gpt-4.1",
  "system": "You are a billing assistant for ACME Corp...",
  "memory_blocks": [
    { "label": "persona", "value": "Polite, concise, ACME brand voice.", "limit": 2000 },
    { "label": "human",   "value": "",                                    "limit": 5000 },
    { "label": "policies","value": "ACME refund policy: ...",             "limit": 4000, "read_only": true }
  ],
  "tools": ["search_invoices", "issue_refund", "archival_memory_insert"],
  "embedding": "openai/text-embedding-3-small"
}
```

**Archival memory.** Beyond core blocks, Letta agents have archival memory
(vector-indexed, unlimited) and recall memory (conversation history). These
are managed through dedicated tools the agent calls to page memory in and
out. This is the main differentiator from the stateless-by-default agents in
OpenAI SDK / CrewAI / LangGraph.

---

### 1.9 Vertex AI Agent Builder / Google ADK

Google's Agent Development Kit (`google-adk`) shipped in 2025 and is the
Python/JS framework underneath Vertex AI Agent Builder.

**Agent hierarchy:**

- `BaseAgent` — abstract base.
- `LlmAgent` / `Agent` — LLM-backed agent with tools, instructions,
  callbacks, and sub-agents.
- Workflow agents: `SequentialAgent`, `ParallelAgent`, `LoopAgent` —
  deterministic orchestrators that compose other agents.
- Custom agents — subclass `BaseAgent`.

**`LlmAgent` fields** (approximate; ADK has evolved quickly):
`name`, `model`, `instruction`, `tools`, `sub_agents`, `output_key`
(where to write result in shared state), `before_agent_callback` /
`after_agent_callback`, `planner`, `code_executor`, `input_schema`,
`output_schema`.

ADK is the **only major framework that ships a first-class workflow-agent
concept** (Sequential / Parallel / Loop) as peers of the LLM agent. Agents
can be composed as children of other agents, creating a tree.

Declarative format: ADK primarily exposes Python classes. Vertex AI Agent
Builder wraps this with a console UI and can export / import a JSON
representation for deployment, but the documented source of truth is still
the Python class.

---

### 1.10 Others — opencode, Aider, Cursor rules, Goose

- **opencode.** Open-source Claude Code alternative. Uses the same
  `.claude/agents/` Markdown subagent format for compatibility. Adds its own
  `opencode.json` project config but delegates agent definitions to files.
- **Aider.** No agent object. Uses `.aider.conf.yml` for model / editor
  settings and `CONVENTIONS.md` / `AGENTS.md` for instructions. Treats the
  whole session as one implicit agent.
- **Cursor.** `.cursor/rules/*.mdc` files are scoped instruction rules, not
  agents. Cursor's "Agents" feature uses these rules plus per-project
  settings, but does not expose a standalone agent definition file format.
- **Goose (Block).** Open-source agent from Block, now under the LF Agentic
  AI Foundation. Defines agents in TOML with model, provider, extensions
  (the Goose term for tools/MCP), and system prompt. Close in spirit to a
  code-first framework but with a TOML manifest.
- **Arch (katanemo).** Agent gateway. Defines "prompt targets" as routable
  personas with natural-language descriptions, parameter extraction schemas,
  and backend endpoints. Not a full agent framework — it is the router in
  front of one.

---

## 2. Cross-framework comparison matrix

Legend: (code) = code-first, (decl) = declarative supported, (md) = Markdown,
(yaml) = YAML, (json) = JSON. Y = first class, ~ = partial, N = not provided.

| Feature                      | OpenAI SDK | Claude Code | LangGraph | CrewAI   | AutoGen  | Swarm | Smolagents | Letta   | ADK     |
|------------------------------|-----------:|------------:|----------:|---------:|---------:|------:|-----------:|--------:|--------:|
| **Format**                   | code       | md          | code      | yaml+code| code+json| code  | code       | json    | code    |
| **Name / identity**          | Y          | Y           | Y         | Y (role) | Y        | Y     | ~          | Y       | Y       |
| **System prompt / instr.**   | Y          | Y (body)    | Y         | Y (split)| Y        | Y     | Y          | Y       | Y       |
| **Model binding**            | Y          | Y           | Y         | Y        | Y        | Y     | Y          | Y       | Y       |
| **Sampling params**          | Y          | ~ (effort)  | Y         | ~        | Y        | N     | ~          | ~       | Y       |
| **Tool list**                | Y          | Y           | Y         | Y        | Y        | Y     | Y          | Y       | Y       |
| **Tool deny-list**           | N          | Y           | N         | N        | N        | N     | N          | N       | N       |
| **MCP servers**              | Y          | Y           | ~         | ~        | Y        | N     | Y          | ~       | ~       |
| **Handoffs / delegation**    | Y          | ~ (dispatch)| ~         | Y        | Y        | Y     | Y          | N       | Y       |
| **Typed output contract**    | Y          | N           | Y         | ~        | ~        | N     | ~          | N       | Y       |
| **Input/output guardrails**  | Y          | ~ (perms)   | ~         | N        | ~        | N     | N          | N       | ~       |
| **Memory (pinned / block)**  | ~          | Y (scope)   | Y (store) | Y (crew) | Y        | ~     | N          | Y       | Y       |
| **Memory (vector/archival)** | ~          | ~ (skills)  | Y         | Y        | ~        | N     | N          | Y       | ~       |
| **Lifecycle hooks**          | Y          | Y           | Y (mw)    | Y (cb)   | Y        | N     | ~          | ~       | Y       |
| **Rate / iter limits**       | N          | Y (maxTurns)| Y         | Y        | ~        | N     | Y          | ~       | ~       |
| **Permission mode**          | N          | Y           | N         | N        | N        | N     | ~ (sandbox)| N       | N       |
| **Isolation (sandbox/wt)**   | N          | Y           | N         | N        | N        | N     | Y (sandbox)| N       | N       |
| **Declarative file format**  | N          | Y           | N         | Y        | ~ (dump) | N     | N          | Y (json)| ~       |
| **Built-in tracing**         | Y          | Y           | Y         | Y        | Y        | ~     | ~          | Y       | Y       |
| **Version field on agent**   | N          | N           | N         | N        | Y        | N     | N          | ~       | N       |
| **Agent-as-tool pattern**    | Y          | ~           | Y         | Y        | Y        | Y     | Y          | N       | Y       |
| **Eval hooks**               | Y          | ~           | Y         | ~        | ~        | N     | ~          | N       | Y       |

**Convergences.**

- *Everyone* has: `name`, system prompt, model, tools.
- *Most* have: handoffs or sub-agents, lifecycle hooks, some form of
  tool restriction.

**Divergences.**

- Only Claude Code has a first-class permission/isolation model.
- Only Letta makes memory blocks a definitional concern of the agent.
- Only CrewAI splits the system prompt into role / goal / backstory.
- Only AutoGen v0.4 has a formal component serialisation format for agents
  (with a `version` field).
- Only Google ADK makes workflow orchestrators (`SequentialAgent`,
  `ParallelAgent`, `LoopAgent`) peers of the LLM agent.

---

## 3. Terminology: skill vs agent vs subagent vs tool — disentangled

The industry overloads these terms. A defensible taxonomy:

**Tool.** A single function / API endpoint the model can call. Stateless
from the agent's perspective. Has a name, description, input schema, and
return type. Examples: `search_web`, `read_file`, `send_email`.

**Skill.** A *bundle of domain knowledge and capabilities* that teaches an
agent how to do something, without itself being an agent. In Claude Code,
a skill is a directory with a `SKILL.md` (instructions), optional scripts,
and optional templates. The skill is loaded into an agent's context when
relevant, and may expose tools, but it cannot run on its own — it has no
model, no context window. Anthropic ships this as "Agent Skills" across
Claude Code, the API, and claude.ai.

**Agent.** A configured runtime: model + system prompt + tools + (optional)
memory + (optional) sub-agents. Has its own context window. Can be invoked
directly by a user or by another agent.

**Subagent.** An agent invoked by another agent, usually via a structured
dispatch mechanism (Claude Code's `Task` tool, OpenAI SDK handoffs,
LangGraph sub-graphs, CrewAI `allow_delegation=True`). The file format is
*usually identical* to a top-level agent — the distinction is positional,
not structural. The same `code-reviewer.md` is a subagent when an
orchestrator spawns it and a top-level agent when the user runs it directly.

**Workflow / crew / team.** A composition of agents plus execution rules
(sequential, parallel, round-robin, hierarchical). Not an agent itself but
a container. CrewAI's `Crew`, AutoGen's `GroupChat`, ADK's workflow agents,
LangGraph graphs.

**Persona / role.** Not architectural — a *description* embedded in an
agent's instructions or, in CrewAI, split out into `role`/`backstory`
fields. "Persona" is ambiguous; Letta uses it as a specific memory block.

**Frameworks that conflate these terms:**

- CrewAI uses `role` loosely — sometimes it means identity, sometimes job
  title, sometimes description.
- LangChain historically called any tool-using LLM chain an "agent",
  including what we would now call just a tool-calling loop.
- AutoGen calls *everything* an agent: `UserProxyAgent` is really a user
  input channel, `GroupChat` is an orchestrator, but both are Agents in the
  class hierarchy.
- OpenAI's early Assistants API used "Assistant" for what is now an Agent.

**Frameworks that draw cleaner lines:**

- Claude Code: skill vs subagent vs MCP tool are distinct object types.
- Google ADK: workflow agents are explicitly *not* LLM agents.
- Letta: memory block, agent, tool are three distinct primitives.
- OpenAI Agents SDK: `Agent`, `Tool`, `Guardrail`, `Handoff` are distinct.

**Rule of thumb.** If it has a context window and a model, it is an agent.
If it is a dispatchable function, it is a tool. If it is a bundle of
knowledge that another agent can load, it is a skill. If it is a
composition operator over agents, it is a workflow.

---

## 4. Emerging standards / industry efforts

### 4.1 A2A — Agent2Agent Protocol

Originally from Google Cloud, donated to the Linux Foundation in 2025, now
under the LF Agentic AI Foundation. Defines a wire protocol for
agent-to-agent communication plus an **Agent Card**: a JSON metadata
document published at `/.well-known/agent.json` that describes a remote
agent.

**Agent Card top-level fields:**

| Field               | Type                | Purpose                                              |
|---------------------|---------------------|------------------------------------------------------|
| `name`              | string              | Agent identifier.                                    |
| `version`           | string              | Agent card version.                                  |
| `description`       | string              | Human description.                                   |
| `url`               | string              | Service endpoint.                                    |
| `provider`          | AgentProvider       | Vendor / publisher info.                             |
| `capabilities`      | AgentCapabilities   | `streaming`, `pushNotifications`, `extendedAgentCard`.|
| `defaultInputModes` | string[]            | MIME types accepted by default.                      |
| `defaultOutputModes`| string[]            | MIME types produced by default.                      |
| `skills`            | AgentSkill[]        | Each has `name`, `description`, `inputModes`, `outputModes`. |
| `securitySchemes`   | SecurityScheme[]    | Authentication mechanisms (`http`/`bearer`, `oauth2`, etc.). |
| `security`          | string[]            | Required scheme references.                          |
| `interfaces`        | AgentInterface[]    | Protocol binding declarations.                       |
| `extensions`        | AgentExtension[]    | Extended functionality.                              |
| `signature`         | AgentCardSignature  | Card authenticity proof (public-key signed).          |

A2A has passed 150 supporting organisations as of early 2026 and is
implemented in major cloud agent platforms. It is the de facto
*interoperability* standard for describing a remote agent. It does **not**
define the agent's internal configuration (model, prompt, memory) — it is
an external service-description schema.

### 4.2 AGNTCY / OASF — Open Agentic Schema Framework

AGNTCY is the Linux Foundation project for multi-agent infrastructure.
Formative members include Cisco, Dell, Google Cloud, Oracle, Red Hat.
Its schema layer is the **Open Agentic Schema Framework (OASF)**,
inspired by OCSF (cybersecurity schema). OASF ships `.proto` and `.json`
schemas for "records" that describe an agent, annotated with:

- **Skills** — capabilities the agent has.
- **Domains** — categories of specialisation.
- **Modules** — composable extensions.

OASF is interoperable with A2A and MCP. Think of OASF as the registry /
schema layer (what an agent *is*) and A2A as the runtime / RPC layer (how
agents *talk*). Both are still maturing; AGNTCY is the place to watch for
a true cross-vendor agent definition standard.

### 4.3 AGENTS.md

`AGENTS.md` is a plain-Markdown instructions file at the root of a repo,
intended to be read by any coding agent (Codex, Cursor, Claude Code,
Aider, Windsurf, Kilo, Factory, etc.). It is now stewarded by the LF
Agentic AI Foundation. Key properties:

- **Uppercase filename required** (`AGENTS.md`, not `agents.md`).
- **Plain Markdown**, no frontmatter, no schema.
- **Hierarchical**: nearest `AGENTS.md` to the edited file wins. Monorepos
  can ship one per subproject.
- **Content is convention, not spec**: build commands, test procedures,
  code-style rules, architectural constraints, files the agent must not
  touch.

`AGENTS.md` is *not* an agent definition — it is instructions to whatever
agent happens to be running. It is more analogous to `CONTRIBUTING.md` for
humans than to a CrewAI `agents.yaml` file. But it is the closest thing to
a universally adopted convention in the coding-agent space, and worth
aligning with for the "instructions to agents operating in this repo" slot.

### 4.4 Model Context Protocol (MCP)

Not an agent definition format, but the de facto tool-and-resource protocol.
Any agent definition format going forward should assume MCP as the primary
way to enumerate tools and external resources. Most frameworks above
(OpenAI SDK, Claude Code, AutoGen, smolagents, Letta) now treat
`mcpServers` as a top-level agent field.

### 4.5 Other efforts

- **Agent Protocol (AI Engineer Summit 2024/2025).** Earlier attempt at a
  REST spec for running agents (`/runs`, `/threads`). Largely superseded by
  A2A.
- **OpenAgents (Xlang).** Research project; format did not see wide
  adoption.
- **Model Card for Agents (MCard).** Proposed extension of HF model cards
  to describe agents; still informal, not widely used.

---

## 5. Minimum viable agent definition (synthesized)

Having surveyed a dozen frameworks, here is the minimal set of fields any
serious agent definition needs. These are fields that appear in at least
five of the surveyed frameworks, or that are load-bearing safety/trust
controls even if only one or two frameworks support them.

### 5.1 Identity

- `id` / `name` — machine-readable unique identifier.
- `display_name` — optional human-readable label.
- `description` — when should this agent be chosen? (matters for dispatch.)
- `version` — SemVer string. *Most frameworks omit this; they should not.*

### 5.2 Behaviour

- `instructions` (a.k.a. `system_prompt`, `prompt`) — the system prompt.
- *Optional* `role` / `goal` / `backstory` split (CrewAI-style) — useful
  when authored by non-engineers, less useful for code-first teams.

### 5.3 Capabilities

- `tools` — list of tool references (names from a registry, MCP URIs, or
  inline definitions).
- `mcp_servers` — list of MCP server references or inline configs.
- `skills` — references to skill bundles loaded into context at startup.
- `knowledge_sources` — optional RAG/knowledge-base references.

### 5.4 Constraints

- `disallowed_tools` — deny-list, even if the agent would otherwise inherit.
- `permission_mode` — `default` / `auto` / `ask` / `bypass` / `plan`.
- `max_turns` / `max_iterations` — hard cap on agentic steps.
- `max_rpm` / `rate_limit` — request-per-minute cap.
- `max_execution_time` — wall-clock timeout.
- `token_budget` — hard cap on input+output tokens per run.
- `isolation` — `none` / `worktree` / `sandbox` / `container`.

### 5.5 Memory access

- `memory_scope` — which memory namespaces this agent may read/write
  (`user`, `project`, `local`, `session`, none).
- `memory_blocks` — optional list of pinned blocks à la Letta
  (label, description, limit, read_only).
- `embedder` — embedding model for vector memory.

### 5.6 Handoffs / delegation

- `handoffs` / `can_delegate_to` — list of other agent IDs this agent may
  transfer control to.
- `handoff_description` — how this agent should be described *to other
  agents* considering delegating to it.
- `allow_delegation` — boolean gate.

### 5.7 Model spec

- `model` — `provider/model-id` or a reference into a model registry.
- `model_settings` — `temperature`, `top_p`, `max_tokens`, `tool_choice`,
  `parallel_tool_calls`.
- `fallback_model` — optional; used on failure.
- `function_calling_llm` — optional cheaper model for tool calls
  (CrewAI pattern).

### 5.8 Observability

- `tracing` — on/off, exporter config.
- `metrics` — which metrics to emit (latency, tokens, tool calls, cost).
- `evals` — list of eval suites this agent must pass.
- `hooks` — lifecycle callbacks for custom observability.

---

## 6. Advanced fields for mature frameworks

Beyond the minimum, frameworks running production agents add:

- **Typed output contracts.** `output_type` with a Pydantic / JSON schema.
  Forces the agent to produce structured output, enables downstream typing.
  Present in: OpenAI SDK, LangGraph, ADK, (partial) CrewAI, AutoGen.

- **Input validation / guardrails.** Pre-flight checks on user input
  (jailbreak detection, PII redaction, topic filtering). First-class in
  OpenAI SDK (`input_guardrails`), partial elsewhere.

- **Output guardrails.** Post-flight checks on agent output before
  returning to the user. OpenAI SDK has them as first-class objects; others
  bolt them on as middleware.

- **Eval suites.** Named eval sets the agent is expected to pass, with
  thresholds. Not declared in-file anywhere today; usually a separate
  config. A mature agent spec should reference them.

- **Versioning and promotion.** SemVer on the agent, plus a `stability`
  field (`experimental` / `beta` / `stable`) and a `successors` / `deprecates`
  relationship. AutoGen v0.4 has `version` in its component dump. No other
  framework does.

- **Lineage.** `extends` / `based_on` — one agent inherits from another
  with overrides. No major framework supports this today; it is an
  obvious extension once you have versioning.

- **Signing.** Cryptographic signature over the agent definition so
  downstream consumers can verify authorship. A2A Agent Cards have this
  (`signature` field); nobody else does.

- **Cost budget.** Per-run dollar cap, not just token cap. Some platforms
  (Vertex, LangSmith) enforce this at runtime; very few agent definitions
  declare it.

- **Concurrency / isolation guarantees.** Can this agent run in parallel
  with itself? Is it idempotent? Does it need an exclusive lock on a
  workspace? Claude Code's `isolation: worktree` is the only in-file
  declaration of this in production.

---

## 7. Declarative vs code-first

The split is real and worth naming.

**Code-first (OpenAI SDK, LangGraph, Swarm, Smolagents, AutoGen, ADK).**
The agent is a Python object. Configuration is Python code. Pros: full
language power, easy dynamic config, no DSL to learn. Cons: harder to
version, harder to diff review, harder for non-engineers to author, no
natural registry format.

**Declarative (Claude Code, CrewAI, Letta, A2A, AGNTCY).** The agent is a
file (Markdown + frontmatter, YAML, JSON). Pros: diffable, reviewable,
registerable, author-able by non-engineers, can be signed, can be
distributed as artifacts, trivially versioned. Cons: DSL limitations;
dynamic behaviour requires escape hatches; tooling has to re-read files
on change.

**Hybrid (CrewAI is the clearest example).** YAML defines the static
surface (role, goal, backstory, tools, model). A thin Python layer binds
the YAML to runtime objects and provides hooks for code where needed.
This is probably the right target for any serious agent platform: *default
declarative, with a typed code escape hatch*.

Observed trend (last 6 months, per practitioner posts): teams that started
code-first are migrating the *static* parts of their agent definitions to
YAML / JSON / Markdown so they can be reviewed, versioned, and deployed
without redeploying the orchestrator. Teams that started declarative are
adding code hooks for dynamic instructions and middleware. The two worlds
are converging on hybrids.

---

## 8. Standards checklist for Fulcrum audit

Fulcrum currently has no explicit agent-definition file format. This
checklist is what a Fulcrum audit should verify once such a format exists,
or what to build toward when designing one.

### 8.1 MUST

1. **Stable identity.** Every agent has a unique machine-readable `id`,
   a human-readable `name`, and a `version` string (SemVer).
2. **Behaviour is first-class.** The `instructions` / system prompt is
   part of the definition, not hidden in code. It must be diffable.
3. **Tool surface is declared.** Tools (and MCP servers) are enumerated
   explicitly, not inherited implicitly. Ambient capability is the single
   largest footgun in code-first frameworks.
4. **Deny-list support.** The format supports `disallowed_tools`, because
   whitelists alone do not compose across inheritance or skill loading.
5. **Permission mode / isolation.** The format declares whether the agent
   may write, delete, spawn processes, or access the network. Default to
   the most restrictive.
6. **Hard limits are declarative.** `max_turns`, `max_execution_time`,
   `token_budget` are fields on the agent definition, not runtime-only.
7. **Model spec is explicit.** `provider/model-id` plus sampling params.
   No implicit defaults that drift as the framework changes.
8. **Memory scope is declared.** Which memory namespaces this agent may
   read, which it may write. Default read-only on anything shared.
9. **Handoffs are declared.** The set of agents this one may delegate to
   is explicit. No implicit "everyone can delegate to everyone".
10. **Observability is turned on by default.** Tracing + metrics wired to
    a default exporter without user action.

### 8.2 SHOULD

11. **Typed output contract** for any agent consumed by other software.
12. **Input + output guardrails** as first-class lists on the agent, not
    middleware monkey-patched at runtime.
13. **Declarative-by-default with a code escape hatch** (CrewAI pattern).
14. **Lineage / inheritance** — `extends: base-agent` with field overrides.
15. **Eval references** — named eval suites the agent must pass before
    promotion.
16. **Stability tag** (`experimental` / `beta` / `stable`) and a
    `successors`/`deprecates` link.
17. **Signing** — cryptographic signature over the canonicalised spec,
    so downstream consumers can verify authorship.
18. **Skill references** — loadable skill bundles, with hashes for
    reproducibility.
19. **A2A Agent Card generation** — the framework can emit an A2A Agent
    Card from the agent definition so the agent is addressable over the
    network without hand-maintaining two files.
20. **Workspace / tenancy scoping** — which workspaces an agent may act
    in; enforced at dispatch time, not just by convention.

### 8.3 MAY

21. **Role / goal / backstory split** for non-engineer authors.
22. **Inline memory blocks** for Letta-style pinned memory.
23. **Cost budget in dollars**, not just tokens.
24. **Workflow agents as peers** (ADK-style sequential / parallel / loop).
25. **Hot reload** of declarative definitions without restarting the host.
26. **Registry integration** — pull agent definitions from a central
    registry by URI (`agent://org/name@version`).
27. **OASF compliance** — ability to emit an OASF record for registry
    publication.
28. **Concurrency class** — `singleton`, `per-workspace`, `parallel` —
    declared on the agent to prevent foot-guns in job schedulers.

---

## 9. References

**OpenAI Agents SDK**
- https://openai.github.io/openai-agents-python/agents/
- https://github.com/openai/openai-agents-python

**Claude Code subagents and Agent SDK**
- https://code.claude.com/docs/en/sub-agents
- https://docs.anthropic.com/en/docs/claude-code/sub-agents
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agent-sdk/skills
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

**LangChain / LangGraph**
- https://docs.langchain.com/oss/python/langchain/agents
- https://langchain-ai.github.io/langgraph/

**CrewAI**
- https://docs.crewai.com/concepts/agents
- https://docs.crewai.com/concepts/crews

**AutoGen / AG2**
- https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.agents.html
- https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/agents.html
- https://docs.ag2.ai/latest/docs/api-reference/autogen/AssistantAgent/
- https://github.com/microsoft/autogen/issues/5064 (declarative group chat configs)

**Swarm**
- https://github.com/openai/swarm

**Smolagents**
- https://huggingface.co/docs/smolagents/index

**Letta / MemGPT**
- https://docs.letta.com/guides/agents/memory-blocks
- https://www.letta.com/blog/memory-blocks
- https://www.letta.com/blog/letta-v1-agent
- https://github.com/letta-ai/letta

**Google ADK / Vertex Agent Builder**
- https://adk.dev/agents/
- https://google.github.io/adk-docs/agents/

**Interop standards**
- https://a2a-protocol.org/latest/ (A2A protocol)
- https://a2a-protocol.org/latest/specification/ (Agent Card schema)
- https://github.com/agntcy/oasf (Open Agentic Schema Framework)
- https://www.linuxfoundation.org/press/linux-foundation-welcomes-the-agntcy-project-to-standardize-open-multi-agent-system-infrastructure-and-break-down-ai-agent-silos
- https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- https://agents.md/ (AGENTS.md convention)
- https://github.com/agentsmd/agents.md

**Terminology**
- https://colinmcnamara.com/blog/understanding-skills-agents-and-mcp-in-claude-code
- https://www.antstack.com/blog/claude-agents-subagents-agent-teams-skills-and-mcp-a-developer-s-field-guide/

---

## Appendix A — Full example agent definitions

### A.1 YAML (CrewAI-style, annotated)

```yaml
# config/agents.yaml
# CrewAI-flavoured agent definition. One top-level key per agent.
# Variables like {topic} are substituted at kickoff time.

senior_researcher:
  # --- Identity (role/goal/backstory is CrewAI's three-field persona) ---
  role: >
    Senior Research Analyst specialising in {topic}
  goal: >
    Produce a concise, factual brief on the state of {topic}
    over the last 6 months, backed by primary sources.
  backstory: >
    You've spent a decade doing technical research for policy teams.
    You value primary sources, hedge uncertainty explicitly, and never
    fabricate citations.

  # --- Model spec ---
  llm: openai/gpt-4.1
  function_calling_llm: openai/gpt-4o-mini   # cheaper model for tool calls
  respect_context_window: true

  # --- Capabilities ---
  tools:
    - SerperDevTool
    - WebsiteSearchTool
    - ScrapeWebsiteTool
  knowledge_sources:
    - path: knowledge/domain-glossary.md
      type: markdown

  # --- Constraints ---
  allow_delegation: false
  max_iter: 15
  max_rpm: 20
  max_execution_time: 300            # 5 minutes wall clock
  max_retry_limit: 2
  cache: true

  # --- Behavioural tuning ---
  reasoning: true                    # plan before executing
  max_reasoning_attempts: 2
  inject_date: true
  verbose: true
```

### A.2 Markdown + YAML frontmatter (Claude Code-style, annotated)

```markdown
---
# ---- Identity ----
name: architecture-reviewer
description: >
  Reviews architectural decisions and ADRs for tradeoff coverage,
  risk identification, and alignment with existing patterns.
  Use proactively when a new ADR is drafted or when major
  architectural changes are proposed.

# ---- Model ----
model: sonnet                        # or `opus`, `haiku`, or a full model ID
effort: high                         # override session effort

# ---- Capabilities ----
tools:
  - Read
  - Grep
  - Glob
  - WebFetch
disallowedTools:
  - Write
  - Edit
  - Bash
mcpServers:
  - github                           # reference an already-configured server
skills:
  - architecture-patterns
  - adr-writing

# ---- Constraints / behaviour ----
permissionMode: plan                 # read-only planning mode
maxTurns: 30
isolation: worktree                  # isolated copy of the repo
background: false

# ---- Memory ----
memory: project                      # cross-session learning for this project

# ---- UX ----
color: purple
---

You are an experienced software architect reviewing architectural
decisions. When invoked:

1. Read the ADR or change description fully before commenting.
2. For each decision, verify that at least one alternative was
   considered and rejected with reasons.
3. Flag any implicit assumptions about scale, concurrency,
   failure modes, or tenancy.
4. Cross-check the proposal against existing patterns in
   `docs/architecture/` and call out deviations.
5. Return a short review with: (a) strengths, (b) gaps,
   (c) required changes, (d) optional improvements.

Do not modify any files. If changes are needed, describe them
as specific diffs the author can apply.
```

### A.3 TypeScript / code-first (OpenAI-Agents-JS / generic, annotated)

```ts
// agents/billing-support.ts
// Code-first agent definition. Close in spirit to the OpenAI Agents SDK.
// Exported as a value the orchestrator imports and registers.

import { Agent, tool, z } from "@openai/agents";

// ---- Tool definitions (colocated for clarity) --------------------------

const lookupInvoice = tool({
  name: "lookup_invoice",
  description: "Look up an invoice by ID for the current customer.",
  parameters: z.object({
    invoice_id: z.string().describe("Invoice identifier, e.g. INV-12345"),
  }),
  async execute({ invoice_id }, ctx) {
    return await ctx.services.billing.getInvoice(invoice_id);
  },
});

const issueRefund = tool({
  name: "issue_refund",
  description: "Issue a refund for an invoice. Requires manager approval.",
  parameters: z.object({
    invoice_id: z.string(),
    amount_cents: z.number().int().positive(),
    reason: z.string().min(10),
  }),
  async execute({ invoice_id, amount_cents, reason }, ctx) {
    return await ctx.services.billing.refund(invoice_id, amount_cents, reason);
  },
});

// ---- Handoff target: an escalation agent --------------------------------

import { escalationAgent } from "./escalation";

// ---- The agent itself ---------------------------------------------------

export const billingSupportAgent = new Agent({
  // Identity
  name: "billing-support",
  handoffDescription:
    "Use for questions about invoices, refunds, and subscription changes.",

  // Behaviour
  instructions: `You are a billing support specialist for ACME Corp.
Be polite, concise, and factual. Never promise refunds you haven't
already issued. If the request is outside billing (e.g. technical
support, legal), hand off to the escalation agent.`,

  // Model spec
  model: "gpt-4.1",
  modelSettings: {
    temperature: 0.2,
    toolChoice: "auto",
    parallelToolCalls: false,
  },

  // Capabilities
  tools: [lookupInvoice, issueRefund],

  // Handoffs
  handoffs: [escalationAgent],

  // Structured output contract
  outputType: z.object({
    reply: z.string(),
    actions_taken: z.array(z.string()),
    needs_escalation: z.boolean(),
  }),

  // Guardrails
  inputGuardrails: [
    // Reject obvious jailbreaks before they reach the model.
    async (input) => ({
      tripwireTriggered: /ignore.*previous.*instructions/i.test(input),
      outputInfo: { kind: "jailbreak-filter" },
    }),
  ],
  outputGuardrails: [
    // Never leak PAN / card numbers in replies.
    async (output) => ({
      tripwireTriggered: /\b\d{13,19}\b/.test(output.reply),
      outputInfo: { kind: "pan-leak-filter" },
    }),
  ],

  // Lifecycle
  hooks: {
    onStart: (ctx) => ctx.logger.info("billing-support start"),
    onEnd:   (ctx) => ctx.logger.info("billing-support end"),
  },
});
```

---

## Appendix B — Convergence summary

If a team today wanted to build an agent definition format that maximises
*leverage of existing conventions*, it would look roughly like this:

1. **File format.** Declarative YAML or Markdown+frontmatter as the default,
   with a typed code binding for dynamic behaviour.
2. **Required fields.** `name`, `description`, `version`, `instructions`,
   `model`, `tools`, `permission_mode`.
3. **Inherited conventions.** Frontmatter and naming from Claude Code.
   Role/goal/backstory optional, from CrewAI. Handoffs from OpenAI SDK.
   Memory blocks from Letta. Workflow agents from ADK.
4. **Emit A2A Agent Card** automatically from the definition — for free
   interoperability with the rest of the agent ecosystem.
5. **Emit OASF record** for registry publication.
6. **Load MCP servers** as first-class capability, not an afterthought.
7. **Version, sign, and promote** definitions through a registry with
   stability tags.

No single framework today does all of this. The opportunity is real.
