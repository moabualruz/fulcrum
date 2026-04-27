---
name: yq
description: Use this skill whenever the user works with YAML, TOML, or XML on the command line — extracting fields from a Kubernetes manifest, editing a value in place while preserving comments and anchors, splitting or merging multi-document YAML, or round-tripping between YAML/JSON/TOML/XML/CSV. Trigger phrases include "edit a YAML file from the shell", "extract a key from a kubernetes manifest", "convert YAML to JSON", "merge two yaml configs", "preserve comments while editing yaml", "round-trip a TOML file", "split a multi-doc kubernetes file". This skill targets mikefarah/yq (Go binary, jq-like `.path` syntax), NOT kislyuk/yq (Python wrapper that pipes through jq) — the two share a name but differ in flags and semantics. Skip for JSON-only work (use jq), CSV row math (awk/miller), or in-program YAML parsing inside Python/Go (use the language stdlib).
---

# yq

## When to use

- The user has a YAML file — `values.yaml`, a Kubernetes manifest, a CI workflow, a `compose.yaml`, a Helm chart — and wants to read, edit, or reshape it.
- The agent must extract a specific value from `kubectl get -o yaml`, `helm show values`, `docker compose config`, or any tool emitting YAML.
- The user wants to convert YAML ↔ JSON ↔ TOML ↔ XML, or merge two YAML files, **and** comment / key-order preservation matters.
- The file is a multi-document YAML (`---` separators) and the user needs to filter or split by document.

**Skip** for: pure JSON (use `jq`); CSV/TSV row aggregation (use `awk`, `miller`); XML when the source-of-truth is XML and you need XPath (use `xmlstarlet`); YAML parsing inside a Python/Go/Node program (use the language stdlib).

## Two yq binaries — disambiguate first

```bash
yq --version
# mikefarah:  "yq (https://github.com/mikefarah/yq/) version v4.x.y"
# kislyuk:    "yq 3.x.y"  (pip-installed; wraps jq)
```

This skill assumes **mikefarah/yq v4+**. If `--version` shows kislyuk, the recipes here will not work — kislyuk uses jq syntax with a `-y` flag for YAML output; mikefarah uses `.path` directly and writes YAML by default.

## Invocation

```bash
# Read one field
yq '.spec.containers[0].image' deploy.yaml

# Edit in place — comments preserved
yq -i '.spec.replicas = 3' deploy.yaml

# Multi-doc: pick by predicate, or by index
yq 'select(.kind == "Deployment") | .spec.replicas' manifests.yaml
yq 'select(documentIndex == 0) | .metadata.name' manifests.yaml    # pick doc by index (or use `select(di == 0)`)

# Format conversion
yq -o json file.yaml                 # YAML → JSON (default input is YAML)
yq -p json -o yaml file.json         # JSON → YAML
yq -p toml -o yaml Cargo.toml
yq -p xml  -o yaml pom.xml

# Inject a shell value safely
cluster=prod yq '.config.cluster = strenv(cluster)' f.yaml   # export envvar; use strenv() / env() in expression
port=8080 yq '.service.port = (env(port) | tonumber)' f.yaml   # typed: cast env via | tonumber

# Exit non-zero on null/false (scripts)
yq -e '.spec.replicas' deploy.yaml >/dev/null || echo "missing"
```

## Patterns

### A — read a field from a Kubernetes manifest

```bash
yq '.spec.template.spec.containers[0].image' deployment.yaml
kubectl get deploy api -o yaml | yq '.status.readyReplicas'
```

### B — edit in place, comments preserved

```bash
yq -i '.spec.replicas = 5' deploy.yaml
yq -i '.image.tag = "v1.2.3"' values.yaml
yq -i 'del(.metadata.annotations."deprecated.io/old-key")' deploy.yaml
```

`-i` rewrites the file. Unlike `sed`, comments, key order, and anchors are kept.

### C — multi-document YAML (k8s, kustomize, helm output)

```bash
# Filter to a single kind
yq 'select(.kind == "Deployment")' manifests.yaml

# Edit one document by predicate
yq -i '(select(.kind == "Deployment") | .spec.replicas) = 4' manifests.yaml

# Cross-document operations need eval-all
yq ea '[.[] | .kind] | unique' manifests.yaml

# Split into per-kind files
yq -s '.kind + "-" + .metadata.name' manifests.yaml   # writes Deployment-api.yml, Service-api.yml, ...
```

`yq` is per-document by default. `eval-all` (alias `ea`) loads every document into one stream so you can compare or fold across them.

### D — merge two configs

```bash
yq ea '. as $item ireduce ({}; . * $item)' base.yaml override.yaml
# shorthand for two files:
yq ea '.[0] * .[1]' base.yaml override.yaml > merged.yaml
```

`*` is deep-merge. Add `*+` to append arrays instead of replacing them, `*?` to merge only matching keys.

### E — convert formats

```bash
yq -o json deploy.yaml > deploy.json     # YAML → JSON (drops comments — lossy)
yq -p json -o yaml api.json > api.yaml   # JSON → YAML
yq -p toml -o json Cargo.toml | jq '.package.version'
yq -p xml  -o yaml pom.xml
yq -o csv '.users | [.[0] | keys] + [.[] | [.id, .name, .email]]' users.yaml
```

`-p` = parse format (input). `-o` = output format. Both default to `yaml`.

### F — defaults, optional paths, with_entries

```bash
yq '.image.tag // "latest"' values.yaml          # null-coalesce
yq '.metadata.annotations[]?' deploy.yaml        # tolerate missing
yq 'with_entries(select(.key | test("^app\\.")))' .config.yaml
yq '.env | to_entries | map(.key + "=" + .value) | .[]' compose.yaml
```

### G — quoting style and anchors

```bash
yq -i '(.password | style) = "double"' secret.yaml          # force double-quoted scalar
yq -i '(.description | style) = "folded"' values.yaml        # >- block style
yq '.. | select(. == "ANCHOR_NAME") | path' file.yaml        # find anchor uses
```

`style` is YAML-only; `tag` (`!!str`, `!!int`) forces explicit type tags when round-trip ambiguity bites.

## Anti-patterns

- **Don't confuse mikefarah/yq with kislyuk/yq.** `yq -y` does not exist in mikefarah — that's a kislyuk flag for "emit YAML". Mikefarah writes YAML by default; pass `-o json` to switch. Always run `yq --version` first if the recipe behaves oddly.
- **Don't path into multi-document YAML without `select`.** `yq '.kind' manifests.yaml` emits one value per document, which surprises pipelines that expect a single answer. Filter explicitly with `select(.kind == "...")` or `select(documentIndex == N)`.
- **Don't edit YAML with `sed`/`awk`.** They mangle quoting, anchors (`&foo`/`*foo`), block scalars (`|`/`>`), and comments. `yq -i` round-trips cleanly.
- **Don't expect `yq -o json` to keep comments.** JSON has no comment syntax — they're dropped by design. If comments are load-bearing, stay in YAML.
- **Don't shell-interpolate values into the expression.** `yq ".tag = \"$VAR\""` breaks on quotes/spaces and is a quoting hazard. Use `name=value yq '... strenv(name) ...'` for strings, or `name=value yq '... (env(name) | tonumber) ...'` for typed values. yq has no `--arg`/`--argjson` flags (those are jq-specific).
- **Don't use mikefarah's `-i` flag on stdin.** `-i` requires a file argument. For stdin, pipe and capture: `cat f.yaml | yq '...' > new.yaml`.
- **Don't pipe binary data through yq.** It's a text processor — UTF-8 in, UTF-8 out. For raw JSON-only streams with no YAML involved, `jq` is faster and more idiomatic.
- **Don't reach for `eval-all` for single-document edits.** `ea` loads every doc into memory and changes the implicit context — use plain `yq` unless you need cross-doc operations.

## Cross-refs

- Sibling skill: `jq` — same path syntax for JSON; reach for jq when no YAML/TOML/XML is involved.
- Pairs with: `kubectl -o yaml | yq …` for cluster inspection, `helm show values | yq` for chart introspection.
- Upstream manual: <https://mikefarah.gitbook.io/yq/>
- Operator reference: <https://mikefarah.gitbook.io/yq/operators>
