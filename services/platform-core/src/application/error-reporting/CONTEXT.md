# Error Reporting

Gated remote crash reporting: scrubs absolute paths, strips PII, HMAC-signs the payload, and enqueues delivery as a background **Job** under the `errors:report` kind.

## Language

**ErrorReportEntry**:
The input record sourced from a persisted error log row, carrying message, stack, occurrence time, and runtime metadata for outbound reporting.
_Avoid_: crash row, log entry, error record

**ErrorReportPayload**:
The PII-free, path-scrubbed snake_case body posted to the configured endpoint.
_Avoid_: report body, crash json, dto

**ErrorReportJob**:
The `errors:report` job envelope wrapping payload, endpoint, signature, and signed headers handed to the queue.
_Avoid_: report task, dispatch message

**PathScrubbing**:
The replacement of `/Users/<name>/`, `/home/<name>/`, and `C:\Users\<name>\` prefixes with `<homedir>` in any user-visible text.
_Avoid_: path redaction, path masking, anonymisation

**ReportSignature**:
The lowercase hex HMAC-SHA256 digest of the serialised **ErrorReportPayload** sent in the `X-Fulcrum-Signature` header.
_Avoid_: hash, token, hmac

**ReportingFeatureGate**:
The `error-reporting-remote` entry inside `FULCRUM_FEATURES` plus a non-empty endpoint that together permit enqueue; either missing makes `enqueueErrorReport` a no-op.
_Avoid_: feature flag, toggle, kill switch

**DeadLetter**:
The terminal disposition applied by the job worker when the endpoint returns a 4xx, preventing retry.
_Avoid_: failed job, rejected report, drop

## Relationships

- An **ErrorReportEntry** produces exactly one **ErrorReportPayload** via `buildReportPayload`.
- An **ErrorReportPayload** is signed once to yield a **ReportSignature** and wrapped into one **ErrorReportJob**.
- An **ErrorReportJob** is enqueued as a platform-core **Job** with `kind = errors:report`.
- A **ReportingFeatureGate** open-state is required before any **ErrorReportJob** is enqueued.
- A 4xx response from the endpoint transitions the **Job** result to **DeadLetter**; non-4xx follows the normal **Job** retry policy.

## Example dialogue

> **Dev:** "Should the **ErrorReportPayload** include the `context` object from the **ErrorReportEntry**?"
> **Domain expert:** "No — context is excluded entirely today to guarantee no PII leak. A future allow-list of safe keys may reopen it, but **PathScrubbing** alone is not enough for free-form values."
> **Dev:** "And if the user sets the secret but not the endpoint?"
> **Domain expert:** "The **ReportingFeatureGate** is closed — `enqueueErrorReport` no-ops. Both the flag and endpoint must be present."

## Flagged ambiguities

- "signature" overlapped the outbound **ReportSignature** and the inbound verification path — resolved: `signPayload` produces a **ReportSignature**; `verifySignature` is the receiver-side constant-time check and shares the algorithm but is not itself a **ReportSignature**.
- "error" overlapped the platform-core audit **Event** and an **ErrorReportEntry** — resolved: an **Event** is an audit row of state change; an **ErrorReportEntry** is a crash record sourced from the error log and never written to the audit stream.
