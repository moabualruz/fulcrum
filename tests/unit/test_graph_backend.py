"""Tests for SQLite graph memory backend. Spec §8.6. B-003."""
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.memory.backends.graph_backend import SQLiteGraphBackend


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


def test_add_entity_and_retrieve(env):
    g = SQLiteGraphBackend()
    ws = "ws_graph_test"
    eid = g.add_entity(ws, "Python", entity_type="language")
    assert eid is not None

    entity = g.get_entity(ws, "Python")
    assert entity is not None
    assert entity["name"] == "Python"
    assert entity["entity_type"] == "language"
    assert entity["id"] == eid


def test_add_edge_creates_entities(env):
    g = SQLiteGraphBackend()
    ws = "ws_edge_create"
    edge_id = g.add_edge(ws, "ServiceA", "ServiceB", label="calls")
    assert edge_id is not None

    # Both entities must have been created
    a = g.get_entity(ws, "ServiceA")
    b = g.get_entity(ws, "ServiceB")
    assert a is not None
    assert b is not None


def test_get_neighbors(env):
    g = SQLiteGraphBackend()
    ws = "ws_neighbors"
    g.add_edge(ws, "A", "B", label="depends_on")
    g.add_edge(ws, "A", "C", label="produces")

    neighbors = g.get_neighbors(ws, "A")
    assert len(neighbors) == 2

    labels = {n["label"] for n in neighbors}
    assert "depends_on" in labels
    assert "produces" in labels

    directions = {n["direction"] for n in neighbors}
    assert "outgoing" in directions


def test_add_episode_and_retrieve(env):
    g = SQLiteGraphBackend()
    ws = "ws_episode"
    ep_id = g.add_episode(ws, "Sprint 1 Kickoff", body="We decided to use FastAPI and Postgres.")
    assert ep_id is not None

    episodes = g.get_episodes(ws)
    assert len(episodes) >= 1
    found = [e for e in episodes if e["id"] == ep_id]
    assert len(found) == 1
    assert found[0]["name"] == "Sprint 1 Kickoff"


def test_entity_upsert_updates_last_seen(env):
    import time
    g = SQLiteGraphBackend()
    ws = "ws_upsert_time"
    g.add_entity(ws, "Redis", entity_type="cache")
    first = g.get_entity(ws, "Redis")
    first_seen_val = first["first_seen"]
    last_seen_first = first["last_seen"]

    # Small sleep to ensure timestamp differs
    time.sleep(0.01)
    g.add_entity(ws, "Redis", entity_type="cache")
    second = g.get_entity(ws, "Redis")

    # first_seen must not change; last_seen must be updated
    assert second["first_seen"] == first_seen_val
    assert second["last_seen"] >= last_seen_first


def test_search_entities(env):
    g = SQLiteGraphBackend()
    ws = "ws_search"
    g.add_entity(ws, "PostgreSQL", entity_type="database")
    g.add_entity(ws, "MySQL", entity_type="database")
    g.add_entity(ws, "FastAPI", entity_type="framework")

    results = g.search_entities(ws, "SQL")
    names = {r["name"] for r in results}
    assert "PostgreSQL" in names
    assert "MySQL" in names
    assert "FastAPI" not in names


def test_temporal_edge_valid_until(env):
    g = SQLiteGraphBackend()
    ws = "ws_temporal"
    valid_from = "2025-01-01T00:00:00+00:00"
    valid_until = "2025-12-31T23:59:59+00:00"

    g.add_edge(
        ws,
        "ContractA",
        "VendorB",
        label="licensed_by",
        valid_from=valid_from,
        valid_until=valid_until,
    )

    neighbors = g.get_neighbors(ws, "ContractA")
    assert len(neighbors) == 1
    assert neighbors[0]["valid_until"] == valid_until
    assert neighbors[0]["valid_from"] == valid_from
