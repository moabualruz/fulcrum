"""Tests for the typed ID system."""
import pytest
from pi_agent_os.ids import (
    generate_id, parse_prefix, is_valid_id, display_id,
    WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX, EVT_PREFIX,
    WF_PREFIX, MEM_PREFIX, TEAM_PREFIX, RUN_PREFIX,
)


def test_generate_id_has_prefix():
    id_ = generate_id(WS_PREFIX)
    assert id_.startswith(WS_PREFIX)


def test_generate_id_unique():
    ids = {generate_id(ISS_PREFIX) for _ in range(100)}
    assert len(ids) == 100


def test_parse_prefix():
    id_ = generate_id(ISS_PREFIX)
    assert parse_prefix(id_) == ISS_PREFIX


def test_parse_prefix_subtask_beats_task():
    from pi_agent_os.ids import SUBTASK_PREFIX, TASK_PREFIX, generate_id
    id_ = generate_id(SUBTASK_PREFIX)
    assert parse_prefix(id_) == SUBTASK_PREFIX
    assert parse_prefix(id_) != TASK_PREFIX


def test_is_valid_id_correct_prefix():
    id_ = generate_id(TASK_PREFIX)
    assert is_valid_id(id_, TASK_PREFIX)


def test_is_valid_id_wrong_prefix():
    id_ = generate_id(TASK_PREFIX)
    assert not is_valid_id(id_, ISS_PREFIX)


def test_is_valid_id_no_prefix_check():
    id_ = generate_id(WF_PREFIX)
    assert is_valid_id(id_)


def test_display_id_format():
    id_ = generate_id(ISS_PREFIX)
    d = display_id(id_)
    assert "-" in d
    assert len(d) > 4


def test_all_prefixes_generate():
    from pi_agent_os import ids
    all_prefixes = [
        ids.WS_PREFIX, ids.PROJ_PREFIX, ids.EPIC_PREFIX, ids.ISS_PREFIX,
        ids.TASK_PREFIX, ids.SUBTASK_PREFIX, ids.PRD_PREFIX, ids.PLAN_PREFIX,
        ids.RUN_PREFIX, ids.WT_PREFIX, ids.REV_PREFIX, ids.ART_PREFIX,
        ids.MEM_PREFIX, ids.HOF_PREFIX, ids.AC_PREFIX, ids.EVT_PREFIX,
        ids.TEAM_PREFIX, ids.AGENT_PREFIX, ids.CYCLE_PREFIX, ids.MILE_PREFIX,
        ids.WF_PREFIX,
    ]
    for prefix in all_prefixes:
        id_ = generate_id(prefix)
        assert id_.startswith(prefix), f"Expected prefix {prefix}, got {id_}"
