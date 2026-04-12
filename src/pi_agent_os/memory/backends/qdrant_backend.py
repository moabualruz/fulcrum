"""Qdrant local vector backend. Spec §8.5. B-002 unblock."""
from __future__ import annotations

import hashlib
import uuid
from typing import Any


class QdrantBackend:
    """
    Local Qdrant vector backend using qdrant-client's embedded mode.

    Supports both in-memory (':memory:') for tests and on-disk persistence.
    Vector store is NOT operational truth — SQLite is always written first.
    """

    def __init__(self, path: str | None = None) -> None:
        self.available = False
        self._path = path if path is not None else ":memory:"
        self._client: Any = None
        self._model: Any = None

        try:
            from qdrant_client import QdrantClient  # noqa: F401
            self.available = True
            self._init_client()
        except ImportError:
            pass

    def _init_client(self) -> None:
        """Initialise the Qdrant client."""
        from qdrant_client import QdrantClient

        if self._path == ":memory:":
            self._client = QdrantClient(":memory:")
        else:
            self._client = QdrantClient(path=self._path)
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        """Create 'pi_memory' collection if it does not exist."""
        from qdrant_client.models import Distance, VectorParams

        if not self._client.collection_exists("pi_memory"):
            self._client.create_collection(
                collection_name="pi_memory",
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )

    def _embed(self, text: str) -> list[float]:
        """Embed *text* using all-MiniLM-L6-v2 (lazy-loaded)."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer("all-MiniLM-L6-v2")
        return self._model.encode([text])[0].tolist()

    @staticmethod
    def _point_id(memory_id: str) -> str:
        """Convert a memory_id string to a UUID usable as a Qdrant point ID."""
        return str(uuid.UUID(bytes=hashlib.md5(memory_id.encode()).digest()))

    def upsert(self, memory_id: str, text: str, payload: dict) -> bool:
        """
        Embed *text* and upsert a point into the 'pi_memory' collection.

        Returns False if the backend is not available.
        """
        if not self.available or self._client is None:
            return False

        from qdrant_client.models import PointStruct

        vector = self._embed(text)
        point = PointStruct(
            id=self._point_id(memory_id),
            vector=vector,
            payload={"memory_id": memory_id, **payload},
        )
        self._client.upsert(collection_name="pi_memory", points=[point])
        return True

    def search(
        self,
        query: str,
        workspace_id: str,
        project_id: str | None = None,
        limit: int = 8,
        score_threshold: float = 0.3,
    ) -> list[dict]:
        """
        Search the 'pi_memory' collection for *query*.

        Filters by workspace_id (and optionally project_id).
        Returns [] if the backend is not available.
        """
        if not self.available or self._client is None:
            return []

        from qdrant_client.models import FieldCondition, Filter, MatchValue

        must = [FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id))]
        if project_id is not None:
            must.append(
                FieldCondition(key="project_id", match=MatchValue(value=project_id))
            )

        query_filter = Filter(must=must)
        vector = self._embed(query)

        results = self._client.query_points(
            collection_name="pi_memory",
            query=vector,
            query_filter=query_filter,
            limit=limit,
            score_threshold=score_threshold,
        )

        return [
            {
                "memory_id": hit.payload.get("memory_id", ""),
                "score": hit.score,
                "payload": hit.payload,
            }
            for hit in results.points
        ]
