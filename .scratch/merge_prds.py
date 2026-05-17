#!/usr/bin/env python3
"""Merge all PRD sources into one sanitized NDJSON at .scratch/prd.jsonl.

Rules:
- Parse robustly. Skip lines that don't parse; record error.
- Normalize schema. Fill defaults. Coerce surface/priority/status.
- Dedup by id (newest ts wins). Then by (surface, area, normalized-title).
- Flag entries with status:"unclear" if intent/sources/acceptance missing or too short.
- Append-only output. One JSON per line.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path("/Users/mkh/workspace/fulcrum/.scratch")

# Source priority (earlier listed = higher trust). All discovered PRD-bearing
# scratch files are merged here; after a successful run they are deleted.
SOURCES = [
    ROOT / "prd.json",                                  # 1294 entries, latest
    ROOT / "prd-research" / "local-inventory-prds.jsonl",
    ROOT / "prd-research" / "acp-review-prds.jsonl",
    ROOT / "prd-research" / "api-service-prds.jsonl",
    ROOT / "prd-research" / "cli-tui-prds.jsonl",
    ROOT / "prd-research" / "docmost-docs-prds.jsonl",
    ROOT / "prd-research" / "plane-work-prds.jsonl",
    ROOT / "prd-research" / "web-interaction-prds.jsonl",
    ROOT / "prd-plane-seeds.jsonl",
    # Untracked / backup PRD files — merged so nothing is lost, then deleted.
    ROOT / "prd.cross-cutting.ndjson",                  # 24
    ROOT / "prd.cross-cutting-only-2026-05-17-1812.json",  # 24 (dup of above)
    ROOT / "prd.json.corrupted",                        # 69 orphans recoverable
    ROOT / "prd.ndjson-malformed-backup-2026-05-17.jsonl",  # 907 (subset/snapshot)
    ROOT / "prd.object-backup-2026-05-17.json",         # 30 user seeds
]

OUT_PATH = ROOT / "prd.jsonl"
ERR_PATH = ROOT / "prd-merge-errors.jsonl"
STATS_PATH = ROOT / "prd-merge-stats.json"

REQUIRED_TEXT_FIELDS = ("id", "title", "intent")
RICH_TEXT_FIELDS = ("acceptance", "sources", "anti_patterns", "interactions")

VALID_PRIORITIES = {"P0", "P1", "P2", "P3"}
VALID_STATUSES = {"proposed", "in-progress", "landed", "verified", "deferred", "deduped", "superseded", "unclear"}


def parse_ts(value: Any) -> datetime:
    fallback = datetime.min.replace(tzinfo=timezone.utc)
    if not value:
        return fallback
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return fallback


def slugify(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80]


def normalize_priority(value: Any) -> str:
    if not isinstance(value, str):
        return "P2"
    v = value.strip().upper().replace(" ", "")
    if v in VALID_PRIORITIES:
        return v
    # tolerate "p0" / "critical" / etc.
    if v in ("CRITICAL", "BLOCKER"):
        return "P0"
    if v in ("HIGH",):
        return "P1"
    if v in ("MEDIUM", "MED"):
        return "P2"
    if v in ("LOW", "NICE-TO-HAVE"):
        return "P3"
    return "P2"


def normalize_status(value: Any) -> str:
    if not isinstance(value, str):
        return "proposed"
    v = value.strip().lower()
    return v if v in VALID_STATUSES else "proposed"


def normalize_surface(value: Any) -> str:
    if not isinstance(value, str):
        return "cross-cutting"
    v = value.strip().lower()
    # consolidate
    v = v.replace(" ", "")
    if v in {"web", "cli", "tui", "api", "service", "desktop", "cross-cutting", "canvas"}:
        return v
    if "," in v or "+" in v or "/" in v:
        # multi-surface tag — keep as cross-cutting
        return "cross-cutting"
    if v.startswith("apps/"):
        return "api" if "server" in v else "web"
    # service-namespaced surface (e.g. "platform-core")
    if v in {
        "platform-core", "work-management", "knowledge-workspace",
        "workflow-coordination", "identity-access", "integration-hub",
        "notification-center", "agent-client-protocol",
        "inference-runtime", "execution-orchestration", "planning-review",
    }:
        return "service"
    if v in {"code-review-ui", "plan-review-ui", "toolbar", "ui-chrome"}:
        return "web"
    return "cross-cutting"


def normalize_entry(raw: Any, source_path: str, line_no: int) -> dict | None:
    if not isinstance(raw, dict):
        return None
    entry = dict(raw)
    # required: id
    eid = entry.get("id")
    if not isinstance(eid, str) or not eid.strip():
        title = entry.get("title") or entry.get("name") or ""
        slug = slugify(title) or f"line-{line_no}"
        eid = f"prd-auto-{slug}"
    entry["id"] = eid.strip()

    # title / intent fallbacks
    if not isinstance(entry.get("title"), str):
        entry["title"] = entry.get("name") or entry["id"]
    if not isinstance(entry.get("intent"), str):
        entry["intent"] = entry.get("description") or entry.get("rationale") or ""

    # surface / priority / status / passes
    entry["surface"] = normalize_surface(entry.get("surface"))
    entry["priority"] = normalize_priority(entry.get("priority"))
    entry["status"] = normalize_status(entry.get("status"))
    entry["passes"] = bool(entry.get("passes", False))

    # list-valued fields: tolerate string by wrapping
    for key in ("sources", "acceptance", "anti_patterns", "critique_focus", "manual_simulation", "interactions", "tests", "screens", "evidence", "supersedes", "parents", "competitor_refs"):
        v = entry.get(key)
        if v is None:
            continue
        if isinstance(v, str):
            entry[key] = [v]
        elif not isinstance(v, list):
            entry[key] = [str(v)]

    # provenance
    entry.setdefault("agent", "unknown")
    if not isinstance(entry.get("ts"), str):
        entry["ts"] = datetime.now(tz=timezone.utc).isoformat()
    entry["_source_path"] = source_path
    entry["_source_line"] = line_no

    # unclear flagging
    intent_text = (entry.get("intent") or "").strip()
    title_text = (entry.get("title") or "").strip()
    if len(intent_text) < 20 or len(title_text) < 6:
        entry["status"] = "unclear"
        unclear_reasons = entry.get("unclear_reasons") or []
        if not isinstance(unclear_reasons, list):
            unclear_reasons = [str(unclear_reasons)]
        if len(intent_text) < 20:
            unclear_reasons.append("intent shorter than 20 chars")
        if len(title_text) < 6:
            unclear_reasons.append("title shorter than 6 chars")
        entry["unclear_reasons"] = unclear_reasons

    if not entry.get("acceptance"):
        entry["status"] = "unclear"
        reasons = entry.get("unclear_reasons") or []
        reasons.append("no acceptance criteria")
        entry["unclear_reasons"] = reasons

    if not entry.get("sources"):
        entry.setdefault("unclear_reasons", []).append("no source citations")

    return entry


def load_lines(path: Path, errors: list) -> list[tuple[int, dict]]:
    if not path.exists():
        return []
    out: list[tuple[int, dict]] = []
    with path.open(encoding="utf-8") as fh:
        # Two strategies:
        # 1. NDJSON: parse each non-empty line as JSON
        # 2. JSON array fallback (some sources wrote multi-line arrays)
        raw = fh.read()

    def attempt_repair(s: str) -> str | None:
        # Common malformations seen in seed agents:
        # 1. Unterminated string before ] (e.g. "...truncated]),"...) → close quote.
        # 2. Trailing comma before } or ].
        # 3. Single trailing ellipsis "..." with missing close-quote.
        repaired = s
        # repair "...,] → "...",]
        repaired = re.sub(r"\.\.\.\](?=,|\})", r'..."]', repaired)
        # repair "...] → "..."]
        repaired = re.sub(r"(?<!\")\.\.\.\]", r'..."]', repaired)
        # remove trailing commas before } or ]
        repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
        if repaired == s:
            return None
        return repaired

    # Try strict NDJSON first
    line_no = 0
    for line in raw.splitlines():
        line_no += 1
        s = line.strip()
        if not s:
            continue
        try:
            obj = json.loads(s)
            if isinstance(obj, list):
                for sub in obj:
                    if isinstance(sub, dict):
                        out.append((line_no, sub))
                continue
            if not isinstance(obj, dict):
                continue
            out.append((line_no, obj))
        except Exception as exc:
            # try repair
            rep = attempt_repair(s)
            recovered = False
            if rep is not None:
                try:
                    obj = json.loads(rep)
                    if isinstance(obj, dict):
                        obj["_repaired"] = True
                        out.append((line_no, obj))
                        recovered = True
                    elif isinstance(obj, list):
                        for sub in obj:
                            if isinstance(sub, dict):
                                sub["_repaired"] = True
                                out.append((line_no, sub))
                        recovered = True
                except Exception:
                    pass
            if not recovered:
                errors.append({"path": str(path), "line": line_no, "error": str(exc), "preview": s[:240]})

    # If NDJSON parse produced very little, try full-document JSON
    if len(out) == 0:
        try:
            doc = json.loads(raw)
            if isinstance(doc, list):
                for i, sub in enumerate(doc):
                    if isinstance(sub, dict):
                        out.append((i + 1, sub))
            elif isinstance(doc, dict):
                items = doc.get("items")
                if isinstance(items, list):
                    for i, sub in enumerate(items):
                        if isinstance(sub, dict):
                            out.append((i + 1, sub))
        except Exception:
            pass
        # NDJSON fallback succeeded — drop line-by-line errors recorded for this path.
        if out:
            errors[:] = [e for e in errors if e.get("path") != str(path)]
    return out


def main() -> int:
    errors: list = []
    by_id: dict[str, dict] = {}
    by_title_key: dict[str, str] = {}  # (surface, area, slug-title) -> winning id
    stats = {
        "sources": [],
        "total_seen": 0,
        "parse_errors": 0,
        "dedup_by_id": 0,
        "dedup_by_title": 0,
        "kept": 0,
        "unclear": 0,
        "by_surface": defaultdict(int),
        "by_priority": defaultdict(int),
        "by_status": defaultdict(int),
        "by_agent": defaultdict(int),
    }

    # Load ALL entries; do not dedup by id. Same id may appear multiple times
    # across sources — each is a distinct candidate.
    all_entries: list[dict] = []
    for src in SOURCES:
        loaded = load_lines(src, errors)
        stats["sources"].append({"path": str(src), "entries": len(loaded)})
        stats["total_seen"] += len(loaded)
        for line_no, raw in loaded:
            norm = normalize_entry(raw, str(src), line_no)
            if norm is None:
                continue
            all_entries.append(norm)

    # Build a content-fingerprint based dedup, ignoring ids.
    # Group by bucket of (surface, area-slug, title-slug).
    # Within a bucket, fuzzy-merge similar titles (Jaccard on word tokens).
    def token_set(s: str) -> set[str]:
        s = (s or "").lower()
        return set(re.findall(r"[a-z0-9]{3,}", s))

    def jaccard(a: set[str], b: set[str]) -> float:
        if not a or not b:
            return 0.0
        inter = len(a & b)
        union = len(a | b)
        return inter / union if union else 0.0

    buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in all_entries:
        surface = e.get("surface", "?")
        area_slug = slugify(str(e.get("area", "")))[:40] or "_"
        buckets[(surface, area_slug)].append(e)

    SIM_THRESHOLD = 0.55  # title-token Jaccard cutoff for "same value"
    INTENT_BOOST = 0.35   # if intent overlap > 0.45 with weaker title match, still merge

    kept: list[dict] = []
    deduped: list[dict] = []

    def score(entry: dict) -> tuple:
        # Higher is better. Use priority numeric (P0=3 best, P3=0).
        pri = entry.get("priority", "P3")
        try:
            pri_num = 3 - int(pri[1])
        except Exception:
            pri_num = 0
        return (
            pri_num,
            len(entry.get("acceptance", []) or []),
            len(entry.get("anti_patterns", []) or []),
            len((entry.get("intent") or "")),
            parse_ts(entry.get("ts")),
        )

    for (surface, area_slug), entries in buckets.items():
        # cluster within bucket by title-token similarity
        clusters: list[list[dict]] = []
        for entry in entries:
            t_tokens = token_set(entry.get("title", ""))
            i_tokens = token_set(entry.get("intent", ""))
            placed = False
            for cluster in clusters:
                rep = cluster[0]
                sim_title = jaccard(t_tokens, token_set(rep.get("title", "")))
                sim_intent = jaccard(i_tokens, token_set(rep.get("intent", "")))
                if sim_title >= SIM_THRESHOLD or (sim_title >= 0.30 and sim_intent >= INTENT_BOOST + 0.10):
                    cluster.append(entry)
                    placed = True
                    break
            if not placed:
                clusters.append([entry])

        for cluster in clusters:
            if len(cluster) == 1:
                kept.append(cluster[0])
                continue
            cluster.sort(key=score, reverse=True)
            # Build a SYNTHESIZED merged entry that takes the best of each
            # contributor instead of dropping losers.
            synth: dict[str, Any] = {}

            # id: keep the strongest id (highest score) but record alternates
            synth["id"] = cluster[0]["id"]

            # title: pick the most informative (longest, then highest score)
            synth["title"] = max((c.get("title") or "" for c in cluster), key=lambda t: (len(t), 1))

            # intent: pick longest non-trivial. If multiple distinct intents add value,
            # concatenate distinct sentences.
            intents = []
            seen_intents = set()
            for c in cluster:
                t = (c.get("intent") or "").strip()
                if not t:
                    continue
                key = re.sub(r"\s+", " ", t.lower())
                if key in seen_intents:
                    continue
                seen_intents.add(key)
                intents.append(t)
            intents.sort(key=lambda t: -len(t))
            synth["intent"] = intents[0] if intents else ""
            if len(intents) > 1:
                # append additional distinct intents that materially add detail
                extras = [t for t in intents[1:] if len(t) > 30][:2]
                if extras:
                    synth["intent"] = synth["intent"].rstrip(". ") + ". Also: " + "; ".join(e.rstrip(". ") for e in extras) + "."

            # surface / area: take from winner
            synth["surface"] = cluster[0].get("surface")
            synth["area"] = cluster[0].get("area")

            # type: take from winner; widen to "feature" if winner has no type
            synth["type"] = cluster[0].get("type") or "feature"

            # priority: take HIGHEST priority across cluster (lowest P number wins)
            best_pri = "P3"
            for c in cluster:
                p = c.get("priority", "P3")
                try:
                    if int(p[1]) < int(best_pri[1]):
                        best_pri = p
                except Exception:
                    pass
            synth["priority"] = best_pri

            # incentive: longest non-trivial
            inc_candidates = [(c.get("incentive") or "").strip() for c in cluster]
            inc_candidates = [t for t in inc_candidates if t]
            synth["incentive"] = max(inc_candidates, key=len) if inc_candidates else ""

            # status: prefer non-unclear if any exists; else unclear
            statuses = [c.get("status", "proposed") for c in cluster]
            if any(s != "unclear" for s in statuses):
                synth["status"] = next(s for s in statuses if s != "unclear")
            else:
                synth["status"] = "unclear"

            # passes: True only if ALL inputs passed
            synth["passes"] = all(bool(c.get("passes", False)) for c in cluster)

            # union list fields (dedup textual equivalents)
            for fld in ("sources", "acceptance", "anti_patterns", "interactions",
                        "critique_focus", "manual_simulation", "competitor_refs",
                        "tests", "screens", "evidence"):
                merged_serialized: dict[str, Any] = {}
                for c in cluster:
                    for item in (c.get(fld) or []):
                        key = json.dumps(item, sort_keys=True) if isinstance(item, dict) else str(item).strip().lower()
                        if key and key not in merged_serialized:
                            merged_serialized[key] = item
                if merged_serialized:
                    synth[fld] = list(merged_serialized.values())

            # merged_from: record every contributor id + source path so trace is preserved
            merged_from = []
            seen_pairs = set()
            for c in cluster:
                pair = (c.get("id"), c.get("_source_path"), c.get("_source_line"))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                merged_from.append({
                    "id": c.get("id"),
                    "source_path": c.get("_source_path"),
                    "source_line": c.get("_source_line"),
                    "ts": c.get("ts"),
                    "agent": c.get("agent"),
                })
            synth["merged_from"] = merged_from
            synth["merged_count"] = len(cluster)

            # agent: combined list of contributing agents
            agents = sorted({c.get("agent", "unknown") for c in cluster})
            synth["agent"] = ",".join(agents) if len(agents) > 1 else (agents[0] if agents else "unknown")

            # ts: latest
            synth["ts"] = max((c.get("ts", "") for c in cluster), key=lambda t: parse_ts(t))

            # carry unclear_reasons union if all marked unclear
            reasons: list[str] = []
            for c in cluster:
                for r in (c.get("unclear_reasons") or []):
                    if r and r not in reasons:
                        reasons.append(r)
            if reasons and synth["status"] == "unclear":
                synth["unclear_reasons"] = reasons

            kept.append(synth)
            stats["dedup_by_title"] += len(cluster) - 1
            # store losers for trace sidecar (unmodified) — they are kept
            # in prd-deduped.jsonl as historical record
            for loser in cluster[1:]:
                loser_record = {k: v for k, v in loser.items()}
                loser_record["merged_into"] = synth["id"]
                loser_record["merged_bucket"] = f"{surface}/{area_slug}"
                deduped.append(loser_record)

    # Emit final NDJSON (kept entries only) + sidecar files
    out_lines = []
    for entry in kept:
        clean = {k: v for k, v in entry.items() if not k.startswith("_")}
        stats["kept"] += 1
        if clean.get("status") == "unclear":
            stats["unclear"] += 1
        stats["by_surface"][clean.get("surface", "?")] += 1
        stats["by_priority"][clean.get("priority", "?")] += 1
        stats["by_status"][clean.get("status", "?")] += 1
        stats["by_agent"][clean.get("agent", "?")] += 1
        out_lines.append(json.dumps(clean, ensure_ascii=False))

    stats["parse_errors"] = len(errors)
    stats["deduped_count"] = len(deduped)

    OUT_PATH.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    DEDUP_PATH = ROOT / "prd-deduped.jsonl"
    DEDUP_PATH.write_text(
        "\n".join(json.dumps({k: v for k, v in d.items() if not k.startswith("_")}, ensure_ascii=False) for d in deduped) + ("\n" if deduped else ""),
        encoding="utf-8",
    )
    ERR_PATH.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in errors) + ("\n" if errors else ""), encoding="utf-8")

    # convert defaultdicts for stats output
    stats["by_surface"] = dict(stats["by_surface"])
    stats["by_priority"] = dict(stats["by_priority"])
    stats["by_status"] = dict(stats["by_status"])
    stats["by_agent"] = dict(sorted(stats["by_agent"].items(), key=lambda kv: -kv[1]))
    STATS_PATH.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(stats, indent=2)[:4000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
