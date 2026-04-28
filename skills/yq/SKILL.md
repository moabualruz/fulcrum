---
name: yq
description: Use this skill whenever the user works with YAML, TOML, or XML on the command line — extracting fields from a Kubernetes manifest, editing a value in place while preserving comments and anchors, splitting or merging multi-document YAML, or round-tripping between YAML/JSON/TOML/XML/CSV. Trigger phrases include "edit a YAML file from the shell", "extract a key from a kubernetes manifest", "convert YAML to JSON", "merge two yaml configs", "preserve comments while editing yaml", "round-trip a TOML file", "split a multi-doc kubernetes file". This skill targets mikefarah/yq (Go binary, jq-like `.path` syntax), NOT kislyuk/yq (Python wrapper that pipes through jq) — two share name but differ in flags and semantics. Skip for JSON-only work (use jq), CSV row math (awk/miller), or in-program YAML parsing inside Python/Go (use language stdlib).
---

# yq

## When to use

- User has YAML file — `values.yaml`, Kubernetes manifest, CI workflow, `compose.yaml`, Helm chart — wants read, edit, reshape.
- Agent must extract specific value from `kubectl get -o yaml`, `helm show values`, `docker compose config`, or any tool emitting YAML.
- User wants convert YAML ↔ JSON ↔ TOML ↔ XML, or merge two YAML files, **and** comment / key-order preservation matters.
- File multi-document YAML (`---` separators), user needs filter or split by document.

**Skip** for: pure JSON (use `jq`); CSV/TSV row aggregation (use `awk`, `miller`); XML when source-of-truth XML and need XPath (use `xmlstarlet`); YAML parsing inside Python/Go/Node program (use language stdlib).

## Two yq binaries — disambiguate first

```bash
yq --version
# mikefarah:  "yq (https://github.com/mikefarah/yq/) version v4.x.y"
# kislyuk:    "yq 3.x.y"  (pip-installed; wraps jq)
```

Skill assume **mikefarah/yq v4+**. If `--version` show kislyuk, recipes here no work — kislyuk use jq syntax with `-y` flag for YAML output; mikefarah use `.path` directly, write YAML by default.

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

`-i` rewrite file. Unlike `sed`, comments, key order, anchors kept.

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

`yq` per-document by default. `eval-all` (alias `ea`) load every document into one stream so can compare or fold across them.

### D — merge two configs

```bash
yq ea '. as $item ireduce ({}; . * $item)' base.yaml override.yaml
# shorthand for two files:
yq ea '.[0] * .[1]' base.yaml override.yaml > merged.yaml
```

`*` deep-merge. Add `*+` to append arrays instead of replace, `*?` to merge only matching keys.

### E — convert formats

```bash
yq -o json deploy.yaml > deploy.json     # YAML → JSON (drops comments — lossy)
yq -p json -o yaml api.json > api.yaml   # JSON → YAML
yq -p toml -o json Cargo.toml | jq '.package.version'
yq -p xml  -o yaml pom.xml
yq -o csv '.users | [.[0] | keys] + [.[] | [.id, .name, .email]]' users.yaml
```

`-p` = parse format (input). `-o` = output format. Both default `yaml`.

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

`style` YAML-only; `tag` (`!!str`, `!!int`) force explicit type tags when round-trip ambiguity bite.

## Anti-patterns

- **Don't confuse mikefarah/yq with kislyuk/yq.** `yq -y` no exist in mikefarah — that kislyuk flag for "emit YAML". Mikefarah write YAML by default; pass `-o json` to switch. Always run `yq --version` first if recipe behave oddly.
- **Don't path into multi-document YAML without `select`.** `yq '.kind' manifests.yaml` emit one value per document, surprise pipelines expecting single answer. Filter explicit with `select(.kind == "...")` or `select(documentIndex == N)`.
- **Don't edit YAML with `sed`/`awk`.** They mangle quoting, anchors (`&foo`/`*foo`), block scalars (`|`/`>`), comments. `yq -i` round-trip clean.
- **Don't expect `yq -o json` keep comments.** JSON no comment syntax — dropped by design. If comments load-bearing, stay in YAML.
- **Don't shell-interpolate values into expression.** `yq ".tag = \"$VAR\""` break on quotes/spaces, quoting hazard. Use `name=value yq '... strenv(name) ...'` for strings, or `name=value yq '... (env(name) | tonumber) ...'` for typed values. yq no `--arg`/`--argjson` flags (jq-specific).
- **Don't use mikefarah `-i` flag on stdin.** `-i` require file argument. For stdin, pipe and capture: `cat f.yaml | yq '...' > new.yaml`.
- **Don't pipe binary data through yq.** Text processor — UTF-8 in, UTF-8 out. For raw JSON-only streams no YAML involved, `jq` faster, more idiomatic.
- **Don't reach for `eval-all` for single-document edits.** `ea` load every doc into memory, change implicit context — use plain `yq` unless need cross-doc operations.

## Cross-refs

- Sibling skill: `jq` — same path syntax for JSON; reach for jq when no YAML/TOML/XML involved.
- Pairs with: `kubectl -o yaml | yq …` for cluster inspection, `helm show values | yq` for chart introspection.
- Upstream manual: <https://mikefarah.gitbook.io/yq/>
- Operator reference: <https://mikefarah.gitbook.io/yq/operators>