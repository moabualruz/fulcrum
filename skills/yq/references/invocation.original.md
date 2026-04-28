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
