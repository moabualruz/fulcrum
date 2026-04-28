## Anti-patterns

- **Don't** scan `node_modules` instead of `package-lock.json`. Lockfiles have *resolved* versions and pin transitive deps; `node_modules` is huge, slow to walk, and may have hoisted/deduped layouts that mislead version detection. Always point at the lockfile.
- **Don't** add an `[[IgnoredVulns]]` entry without `ignoreUntil`. Forever-ignores rot silently — a year later the upstream patch exists, the dep is fixable, and nobody knows because the scanner stopped complaining. Always set a date and re-review.
- **Don't** rely on `package.json` / `Cargo.toml` / `requirements.txt` *manifest* files for vulnerability data. They list constraints, not resolved versions. Only the lockfile (or an SBOM) tells you which exact versions are installed and therefore exposed.
- **Don't** use `--no-resolve` on a fresh Maven/Gradle checkout without confirming a lockfile or SBOM exists. You'll get a green scan because *nothing was scanned*. Verify by running once with full resolution and comparing finding counts.
- **Don't** wait for release time to scan. osv-scanner runs in seconds for typical lockfiles — gate every PR. Replacing five per-ecosystem audits with one binary makes this cheaper, not more expensive.
- **Don't** treat `--licenses` output as legal compliance. It's a starting point for human review; package-metadata license strings are notoriously unreliable, and dual-licensed / vendored sub-deps need a real audit.
- **Don't** swallow exit code 1 with `|| true` to make CI green. That's the entire signal. Fix the dep, ignore the vuln with `ignoreUntil`, or document the exception — but don't silence it.
- **Don't** confuse osv-scanner with secret scanners or SAST. It only knows about *published* vulnerabilities in *known versions* of *packaged dependencies*. It will not find a hand-rolled SQL injection (use `semgrep`), a leaked API key (use `gitleaks`), or a vulnerable internal library (no public advisory exists).
