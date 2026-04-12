"""SQLite-backed graph memory. Spec §8.6. B-003 unblock (no Neo4j required)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from ...db import connection as db


class SQLiteGraphBackend:
    """
    Temporal entity-relationship graph stored in SQLite.

    Covers spec §8.6: entities, relationships, temporal episodes, provenance.
    Does NOT replace SQLite relational truth — this is a named-entity/provenance layer.
    FalkorDB/Neo4j path available via graphiti-core[falkordb] optional extra.
    """

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _new_id() -> str:
        return uuid.uuid4().hex

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Entity API
    # ------------------------------------------------------------------

    def add_entity(
        self,
        workspace_id: str,
        name: str,
        entity_type: str = "concept",
        properties: dict | None = None,
    ) -> str:
        """
        Upsert an entity by (workspace_id, name, entity_type).

        Updates last_seen on conflict. Returns entity_id.
        """
        import json

        now = self._now()
        props = json.dumps(properties or {})

        existing = db.fetchone(
            "SELECT id FROM graph_entities WHERE workspace_id=? AND name=? AND entity_type=?",
            (workspace_id, name, entity_type),
        )
        if existing:
            eid = existing["id"]
            db.execute(
                "UPDATE graph_entities SET last_seen=? WHERE id=?",
                (now, eid),
            )
            return eid

        eid = self._new_id()
        db.execute(
            """INSERT INTO graph_entities(id, workspace_id, name, entity_type, properties, first_seen, last_seen)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (eid, workspace_id, name, entity_type, props, now, now),
        )
        return eid

    def get_entity(self, workspace_id: str, name: str) -> Optional[dict]:
        """Return entity dict or None."""
        import json

        row = db.fetchone(
            "SELECT * FROM graph_entities WHERE workspace_id=? AND name=?",
            (workspace_id, name),
        )
        if row is None:
            return None
        return {
            "id": row["id"],
            "workspace_id": row["workspace_id"],
            "name": row["name"],
            "entity_type": row["entity_type"],
            "properties": json.loads(row["properties"] or "{}"),
            "first_seen": row["first_seen"],
            "last_seen": row["last_seen"],
        }

    def search_entities(
        self,
        workspace_id: str,
        query: str,
        limit: int = 20,
    ) -> list[dict]:
        """LIKE search on entity name / entity_type."""
        import json

        rows = db.fetchall(
            """SELECT * FROM graph_entities
               WHERE workspace_id=?
               AND (name LIKE ? OR entity_type LIKE ?)
               LIMIT ?""",
            (workspace_id, f"%{query}%", f"%{query}%", limit),
        )
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "entity_type": r["entity_type"],
                "properties": json.loads(r["properties"] or "{}"),
                "first_seen": r["first_seen"],
                "last_seen": r["last_seen"],
            }
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Edge API
    # ------------------------------------------------------------------

    def add_edge(
        self,
        workspace_id: str,
        src_name: str,
        dst_name: str,
        label: str,
        episode_id: str | None = None,
        properties: dict | None = None,
        valid_from: str | None = None,
        valid_until: str | None = None,
    ) -> str:
        """
        Add an edge between src_name and dst_name (creating entities if needed).

        Returns edge_id.
        """
        import json

        src_id = self.add_entity(workspace_id, src_name)
        dst_id = self.add_entity(workspace_id, dst_name)

        now = self._now()
        edge_id = self._new_id()
        props = json.dumps(properties or {})
        vf = valid_from or now

        db.execute(
            """INSERT INTO graph_edges
               (id, workspace_id, src_id, dst_id, label, valid_from, valid_until, episode_id, properties)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (edge_id, workspace_id, src_id, dst_id, label, vf, valid_until, episode_id, props),
        )
        return edge_id

    def get_neighbors(
        self,
        workspace_id: str,
        entity_name: str,
        label: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """
        Return neighbours of *entity_name*.

        Each result has: {entity, label, direction, valid_from, valid_until}.
        Both outgoing (src) and incoming (dst) edges are returned.
        """
        entity = self.get_entity(workspace_id, entity_name)
        if entity is None:
            return []

        eid = entity["id"]
        label_filter = "AND e.label=?" if label else ""
        params_out: tuple[Any, ...] = (workspace_id, eid) + ((label,) if label else ())
        params_in: tuple[Any, ...] = (workspace_id, eid) + ((label,) if label else ())

        out_rows = db.fetchall(
            f"""SELECT ge.name AS entity, e.label, 'outgoing' AS direction, e.valid_from, e.valid_until
                FROM graph_edges e
                JOIN graph_entities ge ON e.dst_id = ge.id
                WHERE e.workspace_id=? AND e.src_id=? {label_filter}
                LIMIT {limit}""",
            params_out,
        )
        in_rows = db.fetchall(
            f"""SELECT ge.name AS entity, e.label, 'incoming' AS direction, e.valid_from, e.valid_until
                FROM graph_edges e
                JOIN graph_entities ge ON e.src_id = ge.id
                WHERE e.workspace_id=? AND e.dst_id=? {label_filter}
                LIMIT {limit}""",
            params_in,
        )

        result = []
        for r in list(out_rows) + list(in_rows):
            result.append(
                {
                    "entity": r["entity"],
                    "label": r["label"],
                    "direction": r["direction"],
                    "valid_from": r["valid_from"],
                    "valid_until": r["valid_until"],
                }
            )
        return result[:limit]

    # ------------------------------------------------------------------
    # Episode API
    # ------------------------------------------------------------------

    def add_episode(
        self,
        workspace_id: str,
        name: str,
        body: str,
        source: str = "system",
        reference_time: str | None = None,
    ) -> str:
        """
        Insert an episode.

        Also auto-links any already-known entity names found via substring match in body.
        Returns episode_id.
        """
        now = self._now()
        ep_id = self._new_id()
        ref_time = reference_time or now

        db.execute(
            """INSERT INTO graph_episodes(id, workspace_id, name, body, source, reference_time, ingested_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (ep_id, workspace_id, name, body, source, ref_time, now),
        )

        # Auto-link known entities mentioned in the body
        known = db.fetchall(
            "SELECT id, name FROM graph_entities WHERE workspace_id=?",
            (workspace_id,),
        )
        for ent in known:
            if ent["name"] in body:
                # Update edges that reference these entities — lightweight touch
                db.execute(
                    """UPDATE graph_edges SET episode_id=?
                       WHERE episode_id IS NULL AND workspace_id=?
                       AND (src_id=? OR dst_id=?)""",
                    (ep_id, workspace_id, ent["id"], ent["id"]),
                )

        return ep_id

    def get_episodes(self, workspace_id: str, limit: int = 20) -> list[dict]:
        """Return recent episodes for a workspace (newest first)."""
        rows = db.fetchall(
            """SELECT * FROM graph_episodes
               WHERE workspace_id=?
               ORDER BY reference_time DESC
               LIMIT ?""",
            (workspace_id, limit),
        )
        return [
            {
                "id": r["id"],
                "workspace_id": r["workspace_id"],
                "name": r["name"],
                "body": r["body"],
                "source": r["source"],
                "reference_time": r["reference_time"],
                "ingested_at": r["ingested_at"],
            }
            for r in rows
        ]
