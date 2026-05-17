# Observability, Doctor, Audit, Trace-Spine — Deep Research

> Cluster: doctor/health, audit log, error log, telemetry, runs feed, trace-spine
> visualization. Target: identify the production UI patterns Fulcrum must match or
> deliberately diverge from for its local-first CLI Agent OS, where every "piece of
> work" must be addressable across project → run → artifact → audit.
> Scope informed by current foundation: `fulcrum doctor`, `audit-log` hook,
> `tool-output-router`, per-tool output policy, agent runs concept.

---

## 1. Datadog APM trace view — the reference benchmark

Datadog's trace view is the most-copied production tracing UI; understanding what
it does well (and what it overdoes) is the baseline. The trace header surfaces the
**trace ID** plus critical metadata, and "Open Full Page" produces a shareable
permalink that is the canonical handle for one piece of work in the system
([source][dd-trace]). That permalink is the seed of any trace-spine: every other
view (logs, metrics, dashboards) accepts it as a filter.

Datadog defaults to a **flame graph**: color-coded spans on a horizontal timeline,
scroll-to-zoom, click-and-drag pan, minimap. Spans can be grouped by Service,
Base Service, Host, or Container. The alternative **waterfall view** renders one
row per span with relative + absolute duration, service/resource names, HTTP
status, expand/collapse chevrons, and bulk "Expand all / Collapse all" controls.
A **span list** groups resources by service, sortable by SPANS, AVG DURATION,
EXEC TIME, % EXEC TIME. A **service map** shows topology with "percentage of
total execution time" per node; service entry-span errors render red node
borders, exit-span errors render red edges ([source][dd-trace]).

Span search uses both free-text and key-value (`service:web-ui`,
`duration:>200ms`, group `language:(go OR python)`, boolean
`service:event OR terminator`). Wildcards explicitly unsupported. Errors are
filtered via an "Errors" checkbox highlight, not a separate page — error is a
**facet on the trace**, not a separate top-level concept ([source][dd-trace]).

The detail panel exposes tabs: Span Info, Infrastructure, Logs, Processes,
Network, Security, Profiles, **Span Links**. Span Links is the under-appreciated
primitive: associations between spans that aren't parent/child — useful for async
work, retries, fan-in/fan-out. For traces over 100 MB the UI auto-degrades into
**Trace Preview mode** showing only critical spans, with numbered pills grouping
omitted spans ([source][dd-trace]).

Lesson for Fulcrum: span links are how we should model "this agent run kicked
off that build", "this artifact was produced by that span". Not parent/child —
explicit link with relationship type.

## 2. Honeycomb — query-first, BubbleUp

Honeycomb's trace waterfall shows spans hierarchically with dependency-count
badges, configurable column widths, and a "Highlight errors" toggle that paints
error spans red. The sidebar opens a **minigraph heatmap** that links directly
back to the Query Builder with a pre-filled query corresponding to the selected
region ([source][hc-trace]). This is the key Honeycomb idiom: every view round-
trips to the query builder, so the trace is never a dead-end.

**BubbleUp** is the differentiator. Pick a slow region of a heatmap; BubbleUp
runs automatic dimensional analysis across hundreds of attributes and ranks the
fields that most distinguish slow events from fast ones ([source][hc-bub]). The
output is not "here's the root cause" — it's "these dimensions are
disproportionately represented in the anomaly." For Fulcrum that translates to:
on an error-spike page, surface "what's different about failing runs versus
succeeding ones" — agent, model, project, host, prompt length.

## 3. Sentry — fingerprinted error groups, not raw events

Sentry's central abstraction is the **issue**, not the event. Events fingerprint
via stack-trace hashing into stable groups; the Event Grouping Information panel
shows which frames contributed to the fingerprint and lets the user test
alternate grouping algorithms ([source][sentry-issue]). The right sidebar
displays 24-hour and 30-day frequency, first/last seen timestamps, environment
filter, linked external issues, a facet map of tag distribution. Severity is a
controlled vocabulary: Error, Info, Warning, Fatal, Debug, Sample.

SDK init ([source][sentry-init]) shows the configuration shape Fulcrum should
mirror for opt-in telemetry: `dsn` is the only required field, `tracesSampleRate`
controls span ingestion, `replaysSessionSampleRate` and `replaysOnErrorSampleRate`
control session capture with explicit "fraction of normal sessions, all error
sessions" semantics. Critical pattern: **default sample rates that are obviously
not 100%** so users know capture is intentional and adjustable.

Lesson for Fulcrum error logs: never show 10,000 raw stack traces. Fingerprint
on `(error_type, top_user_frame, tool_name)`, show grouped issues, expose
"events" only on drill-down. Tag distribution as a facet map (agent, model,
project) is the right summary widget.

## 4. LangSmith — the closest analogue

LangSmith is the closest published analogue to what Fulcrum's runs feed must
become. Its hierarchy:

- **Project** — container for traces of one application.
- **Trace** — collection of runs for one operation.
- **Run** — one unit of work (LLM call, parsing, retrieval).
- **Thread** — sequence of traces sharing `session_id` / `thread_id` /
  `conversation_id`.

Trace ID binds all runs of one operation; Run ID is the handle for attaching
feedback. Enrichment via tags (categorical strings), metadata (key-value pairs),
and feedback scores ([source][ls-concepts]). Default retention is 400 days;
preservation requires adding traces to datasets, which "persist indefinitely."

LangGraph integration auto-nests traces. For custom (non-LangChain) code,
`@traceable` decorators wrap functions and LangSmith nests automatically. The
two surface views are **Details** (full trace) and **Messages** (conversation
view of the agent-user dialog) ([source][ls-langgraph]). The Messages view is
the under-appreciated primitive: same data as Details, but rendered as a chat
log with tool-call expansion inline.

Lesson for Fulcrum: the runs feed needs both a structural view (parent/child
spans of a single agent run) **and** a conversational view (turn-by-turn agent
output). Same `trace_id` + `run_id`, two renderers.

## 5. Grafana Tempo + Loki + Mimir — trace-to-logs linking

Grafana's trace-to-logs primitive is the model for cross-signal navigation. Span
attributes are mapped to log labels (`service.name → service_name`,
`namespace → namespace`); explicit mappings let users wire arbitrary spans into
arbitrary log streams ([source][grafana-tracelogs]). Key UX details: time-window
shift defaults to `-2s` start / `+2s` end to "accommodate log lines written
slightly before or after the span boundary." Filtering options: by trace ID
(all trace logs) or by span ID (one span). A dedicated **"Logs for this span"**
button appears in the trace view when configured.

Same primitive extends to metrics (trace-to-metrics via Prometheus) and CPU
profiles (trace-to-profiles via Pyroscope).

Lesson for Fulcrum: the trace-spine is the URL/key scheme. From a single
`trace_id`, every other tool surface must accept it as a filter without extra
clicks: the audit row, the error log, the artifact panel, the doctor probe
output. Don't redesign per-surface — design the linking grammar once.

## 6. OpenTelemetry — the data spec we must conform to

OpenTelemetry traces use 16-byte `trace_id` (32-char lowercase hex), 8-byte
`span_id` (16-char lowercase hex), optional `parent_span_id`, `trace_flags`
(Sampled, Random per W3C), `trace_state` (key-value), `is_remote` boolean
([source][otel-traces], [source][otel-api]). Status codes form a strict
hierarchy: `Ok > Error > Unset`. Default is `Unset`; `Ok` is "explicitly marked
successful by developer"; `Error` includes an optional Description field. Spans
include `kind` (Client, Server, Internal, Producer, Consumer) which determines
whether work crossed a process boundary. Span **events** are timestamped point
annotations. Span **links** are causal-but-not-parent associations.

The API spec strongly recommends setting attributes at span creation rather
than via `SetAttribute` later, because samplers can only consider information
present at creation time ([source][otel-api]).

Lesson for Fulcrum: any time we expose a "trace ID" to the user, it MUST be a
valid 32-char hex W3C trace ID. The CLI should accept an inbound trace ID via
`--trace-id` and respect `traceparent` env var if set. Fulcrum's own runs become
parent spans of any subprocess work, so subprocesses inherit context for free.

## 7. GitHub Actions — re-run UX

Re-run buttons live "in the upper-right corner of the workflow" for full
workflow scope; per-job icons live next to each job in the left sidebar
([source][gha-rerun]). The dropdown labeled "Re-run jobs" offers three scopes:
all jobs, failed jobs only, one specific job. A pre-confirm checkbox enables
"runner diagnostic logging and step debug logging." Re-runs are bounded: 30
days post-original, max 50 partial+full re-runs combined. Re-runs use the
**triggering actor's** privileges, not the re-runner's — important security
default.

Lesson for Fulcrum: re-run a single span / re-run failed steps only / re-run
full agent run. Each should be one click with no modal beyond the
diagnostic-logging toggle. Preserve original triggering identity in the audit
row.

## 8. Vercel build logs — link-to-line as canonical primitive

Vercel build logs are accessed via a **Build Logs** button on the deployment
tile. Color-coded severity (yellow warnings, red errors), 4 MB truncation
limit, "stored indefinitely" retention per deployment ([source][vercel-logs]).
The killer feature: clicking the timestamp on the left of any log entry produces
a permalink with `#L6` anchor; shift-click ranges produce `#L6-L9`. Up to 2000
lines per permalink. **Drains** export to external storage.

Lesson for Fulcrum: every log line in the web view must be deep-linkable.
`#L<n>` is the established convention; copy it. For CLI, output a permalink-
equivalent path: `fulcrum runs logs <run-id> --line 47` should jump to that
line. For TUI, same — keybind `g <n>` jumps to line n.

## 9. Healthchecks.io — status states + grace period

Healthchecks defines five canonical check states: **New** (unpinged), **Up**
(latest success on schedule), **Late** (due signal not yet arrived, within
grace), **Down** (exceeded grace, alerts triggered), **Paused** (manual
suspension) ([source][hc-docs]). Active "start" signals animate as dots.
**Grace period** is configurable and accommodates scheduling deviation; for
cron-based checks, lateness triggers at scheduled execution moment, not period
elapse.

Dashboard model: Projects group Checks and Integrations with separate API keys
and team access. 25+ notification channels. Status **badges** are public-but-
unguessable URLs suitable for README embedding ([source][hc-repo]).

Lesson for Fulcrum doctor: five states matter — Unknown/Untested, OK, Degraded,
Failed, Disabled. Don't conflate "haven't checked yet" with "failed." Surface
last-checked timestamp on every row. Public-but-unguessable badge URLs are a
reasonable opt-in primitive for sharing project health.

## 10. k9s — modal-free dense terminal UI

k9s is the gold standard for terminal-native operations UX. Density without
modals: `:pod⏎` opens pod view, `/<filter>⏎` filters inline (regex; `!` for
inverse), `?` reveals keybindings, single-letter keys for describe (`d`), view
(`v`), edit (`e`), logs (`l`) ([source][k9s-commands], [source][k9s-repo]).
Status colors are a controlled vocabulary in the default Dracula skin: green
(new), orange (modified), red (errors), gray (completed). Only deletions
(`ctrl-d`) require confirmation — every other op is one keystroke.

Lesson for Fulcrum TUI: no modals for navigation. Filter inline; drill-down via
single-letter keys. The status column is a fixed vocabulary, color-coded once,
re-used everywhere (doctor, runs, audit, errors). Confirm only for destructive
ops (delete run, purge audit, abort agent).

## 11. CloudTrail / Okta / Stripe / Auth0 — audit row shape

CloudTrail's `userIdentity` is the canonical audit-actor shape: `type`
(IAMUser, AssumedRole, Root, AWSService, IdentityCenterUser), `principalId`,
`arn`, `accountId`, `userName`, `sessionContext.sessionIssuer` (the upstream
identity if temporary credentials), `sessionContext.attributes.mfaAuthenticated`
([source][aws-ct]). Each event has `eventName`, `eventTime`, `eventSource`,
`awsRegion`, `sourceIPAddress`, `userAgent`, `requestParameters`,
`responseElements`, `errorCode` (when failed).

Stripe Activity Logs surface each row as: actor, timestamp (`created`), action
type (e.g. `api_key_created`), affected resources, contextual metadata.
Filtering by **action group** (broad: API key actions, user invitations, user
roles) or **specific action type**. 10-min ingestion latency, 6-month
retention ([source][stripe-activity]).

Auth0 logs use short opaque event codes (`s` success login, `f` failed login,
`fp` failed-incorrect-password, `gd_auth_succeed`, `pwd_leak`, `limit_mu`)
with structured fields: date, type, description, user_id, ip, user_agent,
details ([source][auth0-codes]). Okta System Log API exposes events with
actor + target, success/failure outcome, severity, time range, export
([source][okta-log]).

Lesson for Fulcrum audit row shape: `(timestamp, actor, action, target,
outcome, source_event_id?, details?)`. Actor is `(type, identifier, session_id)`.
Action is namespaced controlled vocabulary (e.g. `fulcrum.run.created`,
`fulcrum.audit.exported`, `fulcrum.doctor.probed`). Target is a typed reference
(`run:<id>`, `project:<id>`, `artifact:<id>`). `source_event_id` is the
upstream cause — for re-runs, the original run's audit row.

## 12. npm doctor — the subsystem-table pattern

`npm doctor` checks seven subsystems and presents a fixed table: Registry
Connection, npm Version, Node.js Version, Registry Configuration, Git
Executable, Permissions (cache, global bin, node_modules), Cache Integrity
([source][npm-doctor]). Each row has purpose, success indicator, and a recovery
suggestion (e.g. "Update to `npm@latest`", "Execute `npm cache clean -f` if
corruption detected"). Selective checking by passing subsystem names as args.

Lesson for Fulcrum doctor: every probe row carries a recovery command as a copy
button. Don't show "npm version: 8.0.0 - outdated" with no remediation; show
"npm version: 8.0.0 - outdated [Run `npm install -g npm@latest`]" with the
command pre-copyable. Already partially done — extend to every probe.

## 13. Cost / usage telemetry

OpenAI's usage page (cited but blocked by auth — patterns from common knowledge)
shows token usage and cost broken down by model, daily/monthly toggle, request
counts, projected month-end. The discipline: show usage without nagging.
Vercel's deployments dashboard breaks down build minutes and bandwidth without
modal warnings unless a quota is exceeded.

Stripe's usage-based billing UI separates "Record usage" (meter events),
"Monitor usage" (threshold alerts), and customer-facing "Billing Credits"
display ([source][stripe-usage]). Threshold alerts are opt-in, not default
modals.

Lesson for Fulcrum: cost panel is a sidebar tile, not a banner. Per-agent and
per-model breakdowns. Daily/monthly toggle. Soft threshold ("80% of monthly
budget") triggers a single non-modal notification with a "snooze for 24h" and
"adjust budget" link. Never block work for cost.

## 14. Opt-in telemetry — first-run prompt and persistence

GitHub CLI documents the canonical env-var grammar for telemetry control
([source][gh-env]):

- `GH_TELEMETRY=log` — print to stderr instead of transmitting.
- `GH_TELEMETRY=false` (or `0`) — disable entirely.
- `DO_NOT_TRACK=1` — disable; overridden by explicit `GH_TELEMETRY`.
- `GH_NO_UPDATE_NOTIFIER` — disable update check.
- `GH_NO_EXTENSION_UPDATE_NOTIFIER` — disable extension update check.

Precedence rule (explicit tool var beats `DO_NOT_TRACK`) is important: respects
both the project-specific override and the cross-tool convention.

Sentry's SDK init shows the explicit-sample-rate-required pattern
([source][sentry-init]): no default of `1.0`. PostHog documents that data
collection control is split across ingestion/storage layers
([source][posthog-priv]), and anonymous events are first-class.

Lesson for Fulcrum: first-run prompt must be one paragraph, three options
(Yes / No / Anonymous-only), with explicit env-var equivalents documented and
respected: `FULCRUM_TELEMETRY=off|anon|on`, `DO_NOT_TRACK=1`,
`FULCRUM_NO_UPDATE_NOTIFIER=1`. Persisted to user config (`~/.fulcrum/config`),
project override via `.fulcrum/config`. Doctor must surface current telemetry
mode as a row, so it's never hidden.

## 15. Trace-spine specifically — project → run → artifact → audit

Pulling the threads together: production tracing UIs already link these
entities, but via implicit conventions, not explicit data model.

- **Datadog**: trace ID is the spine; logs, metrics, infrastructure all accept
  it as filter ([source][dd-trace]).
- **LangSmith**: `(project, trace, run, thread)` hierarchy with two distinct ID
  spaces (trace ID, run ID); threads link multi-turn conversations across
  traces ([source][ls-concepts]).
- **Grafana**: explicit trace-to-logs, trace-to-metrics, trace-to-profiles
  mappings — span attributes mapped to log labels ([source][grafana-tracelogs]).
- **CloudTrail**: `requestParameters` + `responseElements` carry the trace
  ([source][aws-ct]).

For Fulcrum: every primary entity carries the same trace context. A `Project`
spawns a `Run`; each `Run` is a span tree; each span emits zero or more
`Artifact`s; every state mutation emits an `Audit` row tagged with the trace
context. URL grammar: `/p/<project>/r/<run>?span=<span_id>&trace=<trace_id>`.
CLI grammar: `fulcrum runs show <run_id>`, `fulcrum trace show <trace_id>`,
`fulcrum audit list --trace=<trace_id>`.

---

# Recommendations for Fulcrum

## Doctor page (web + CLI + TUI)

Subsystem table modeled on `npm doctor` × Healthchecks status colors. Columns:
**Subsystem** (controlled vocab: `agent.<name>`, `mcp.<server>`, `hook.<id>`,
`skill.<namespace>`, `repo.gitleaks`, `runtime.bun`, `runtime.node`),
**Status** (Unknown / OK / Degraded / Failed / Disabled — five states matching
Healthchecks), **Last Checked** (relative + absolute on hover), **Detail**
(one-line cause), **Recovery** (copy-button command string or "Run Probe"
button). All five states colored once globally: gray, green, yellow, red, slate.

Per-row probe action: button labeled "Probe" runs the subsystem's check
immediately, updates Last Checked, streams probe stdout into an expandable
sub-row. No modal. Selective re-probe: `fulcrum doctor probe <subsystem>` and
`fulcrum doctor --probe`. Already partially exists; extend to every row.

Telemetry row is mandatory (mode + endpoint), MCP servers each get a row, every
agent runtime gets a row, every spliced rules file gets a row. CLI `fulcrum
doctor --json` returns the same row shape verbatim.

## Audit log

Row shape: `timestamp, actor (type + id + session), action (namespaced verb),
target (typed ref), outcome (ok|error), source_event_id?, trace_id?, details
(JSON)`. Filter row above table with chips for actor, action namespace, target
type, outcome, time range. Time range presets: last 15 min / 1 h / 24 h / 7 d /
custom. Export as JSONL or NDJSON (one row per line, ready for `jq`); CSV
secondary.

Each row's `source_event_id` and `trace_id` are clickable badges that
cross-filter. The audit log is the **only** screen where "show me everything
that touched this run" is one click.

## Runs feed

Top-level: reverse-chronological list of runs across all projects (default
filter: this project). Each entry: status badge (k9s vocabulary), project,
agent, started/duration, trace-ID badge, top-line summary. Inline filters:
status, agent, model, project. Drill-down opens a per-run view with two
sibling tabs (LangSmith pattern): **Trace** (span tree, Honeycomb-style
waterfall with expand/collapse, error highlighting toggle) and **Messages**
(LangSmith Messages view — conversation rendering with inline tool-call
expansion). Sidebar shows linked artifacts and the audit slice for this run.

Per-span actions: re-run from this span (GitHub Actions partial re-run
pattern), open span in dataset (LangSmith pattern), copy trace ID, copy span
ID. Span links rendered as small "→" arrows pointing to the linked span — not
parent/child.

## Error logs

Sentry pattern, not raw stack list. Fingerprint key:
`(error_type, top_user_frame_function, agent_or_tool_name)`. Group view shows
issue rows: fingerprint hash badge, message, count (24h / 7d), agents-affected
facet map, last-seen, first-seen. Drill-down shows event timeline (sparkline),
tag distribution (facet map), most-recent N events with full stack trace,
release/version tag, and **Linked Runs** — the runs whose traces contain this
issue. The trace-ID badge on each event links to the runs feed.

Status pipeline matches Sentry: Unresolved → Acknowledged → Resolved →
Archived. "Ignore this fingerprint for 24h" is a one-click action.

## Telemetry settings

First-run prompt (CLI on `fulcrum init`, web on first project create):

> Fulcrum is local-first and ships **all** telemetry as opt-in. Choose one:
>
> [ ] **On** — Anonymous usage metrics + crash reports. Helps tune defaults.
> [ ] **Anonymous only** — Crash reports without command-level events.
> [x] **Off** — Default. No data leaves your machine.
>
> Set later with `fulcrum config telemetry on|anon|off` or
> `FULCRUM_TELEMETRY=off` env var. `DO_NOT_TRACK=1` is respected.

Persisted to `~/.fulcrum/config.toml`. Per-channel toggles in settings: crash
reports, anonymous events, update notifier (each toggle independently). Doctor
row exposes current state. The settings page exposes the exact env var to set
in `.envrc` for project-level override.

## Trace-ID badge spec — identical across web, CLI, TUI

The trace-ID badge is Fulcrum's single most important cross-surface identity
primitive. Specification:

**Web header** — pill button, 24 px tall, monospace font (Geist Mono / Berkeley
Mono), 12 px text, 8 px horizontal padding. Background `slate-100` light /
`slate-800` dark, border `slate-200` / `slate-700`. Content: leading 8 hex
chars of trace ID + "…" ellipsis (e.g. `4f3a1c9e…`). Click copies full 32-char
ID + writes ID to URL hash. Hover tooltip shows full ID + timestamp + project
+ run.

**CLI JSON output** — every `fulcrum runs|trace|audit|doctor` JSON object
includes:

```json
{
  "trace_id": "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
  "span_id": "8b2d4a6f9c1e3a5b",
  "run_id": "01HXYZ123ABC456DEF789GHI012",
  "project_id": "fulcrum",
  "ts": "2026-05-17T14:23:45.123Z"
}
```

Field order is stable for `jq -c` piping. `--no-trace-context` flag suppresses
for terse output. Plain-text mode prints a single header line:
`trace: 4f3a1c9e…  run: 01HXYZ…  project: fulcrum` aligned with the badge
visual on web.

**TUI status footer** — bottom-bar segment, fixed columns:
`[ trace:4f3a1c9e ]  [ run:01HXYZ ]  [ span:8b2d4a6f ]  [ status:OK ]`. Each
segment is keybind-copyable: `y t` yanks trace ID, `y r` yanks run ID, `y s`
yanks span ID. Same color/typography vocabulary as web (slate background,
monospace). Footer never collapses — it's the spine the user navigates by.

The same 8-char prefix shows everywhere; the full ID is always one keystroke
or click away. That repetition across surfaces is the entire point of the
trace-spine — when a user pastes `4f3a1c9e` into any Fulcrum surface, the
right thing happens.

---

## Citations

[dd-trace]: https://docs.datadoghq.com/tracing/trace_explorer/trace_view/
[hc-trace]: https://docs.honeycomb.io/reference/honeycomb-ui/query/trace-waterfall
[hc-bub]: https://www.honeycomb.io/platform/bubbleup
[sentry-issue]: https://docs.sentry.io/product/issues/issue-details/error-issues/
[sentry-init]: https://docs.sentry.io/product/sentry-basics/integrate-frontend/initialize-sentry-sdk/
[ls-concepts]: https://docs.langchain.com/langsmith/observability-concepts
[ls-langgraph]: https://docs.langchain.com/langsmith/trace-with-langgraph
[grafana-tracelogs]: https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/configure-trace-to-logs/
[otel-traces]: https://opentelemetry.io/docs/concepts/signals/traces/
[otel-api]: https://opentelemetry.io/docs/specs/otel/trace/api/
[gha-rerun]: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
[vercel-logs]: https://vercel.com/docs/deployments/logs
[hc-docs]: https://healthchecks.io/docs/
[hc-repo]: https://github.com/healthchecks/healthchecks
[k9s-commands]: https://k9scli.io/topics/commands/
[k9s-repo]: https://github.com/derailed/k9s
[aws-ct]: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html
[okta-log]: https://developer.okta.com/docs/reference/api/system-log/
[stripe-activity]: https://docs.stripe.com/activity-logs
[auth0-codes]: https://auth0.com/docs/deploy-monitor/logs/log-event-type-codes
[stripe-usage]: https://docs.stripe.com/billing/subscriptions/usage-based
[npm-doctor]: https://docs.npmjs.com/cli/v11/commands/npm-doctor/
[gh-env]: https://cli.github.com/manual/gh_help_environment
[posthog-priv]: https://posthog.com/docs/privacy
