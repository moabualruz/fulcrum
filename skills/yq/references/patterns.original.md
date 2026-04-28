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
