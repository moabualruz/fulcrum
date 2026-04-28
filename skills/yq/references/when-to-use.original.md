## When to use

- The user has a YAML file — `values.yaml`, a Kubernetes manifest, a CI workflow, a `compose.yaml`, a Helm chart — and wants to read, edit, or reshape it.
- The agent must extract a specific value from `kubectl get -o yaml`, `helm show values`, `docker compose config`, or any tool emitting YAML.
- The user wants to convert YAML ↔ JSON ↔ TOML ↔ XML, or merge two YAML files, **and** comment / key-order preservation matters.
- The file is a multi-document YAML (`---` separators) and the user needs to filter or split by document.

**Skip** for: pure JSON (use `jq`); CSV/TSV row aggregation (use `awk`, `miller`); XML when the source-of-truth is XML and you need XPath (use `xmlstarlet`); YAML parsing inside a Python/Go/Node program (use the language stdlib).
