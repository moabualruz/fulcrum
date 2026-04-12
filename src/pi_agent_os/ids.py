"""
ids.py — Typed prefixed ULID ID system for PI Agent OS.

All IDs follow the pattern: {prefix}{ulid_string}
e.g. ws_01HXYZ..., proj_01HXYZ..., iss_01HXYZ...

Display IDs use the last 6 chars of the ULID for a compact human-readable suffix,
e.g. ISS-AB3X4Y, TASK-9ZPQ12.
"""
from __future__ import annotations

from ulid import ULID

# ---------------------------------------------------------------------------
# Prefix constants
# ---------------------------------------------------------------------------

WS_PREFIX = "ws_"
PROJ_PREFIX = "proj_"
EPIC_PREFIX = "epic_"
ISS_PREFIX = "iss_"
TASK_PREFIX = "task_"
SUBTASK_PREFIX = "subtask_"
PRD_PREFIX = "prd_"
PLAN_PREFIX = "plan_"
RUN_PREFIX = "run_"
WT_PREFIX = "wt_"
REV_PREFIX = "rev_"
ART_PREFIX = "art_"
MEM_PREFIX = "mem_"
HOF_PREFIX = "hof_"
AC_PREFIX = "ac_"
EVT_PREFIX = "evt_"
TEAM_PREFIX = "team_"
AGENT_PREFIX = "agent_"
CYCLE_PREFIX = "cycle_"
MILE_PREFIX = "mile_"
WF_PREFIX = "wf_"
POL_PREFIX = "pol_"

# All valid prefixes
ALL_PREFIXES: frozenset[str] = frozenset(
    [
        WS_PREFIX,
        PROJ_PREFIX,
        EPIC_PREFIX,
        ISS_PREFIX,
        TASK_PREFIX,
        SUBTASK_PREFIX,
        PRD_PREFIX,
        PLAN_PREFIX,
        RUN_PREFIX,
        WT_PREFIX,
        REV_PREFIX,
        ART_PREFIX,
        MEM_PREFIX,
        HOF_PREFIX,
        AC_PREFIX,
        EVT_PREFIX,
        TEAM_PREFIX,
        AGENT_PREFIX,
        CYCLE_PREFIX,
        MILE_PREFIX,
        WF_PREFIX,
        POL_PREFIX,
    ]
)

# Ordered by length descending so that "subtask_" is matched before "task_"
_SORTED_PREFIXES: list[str] = sorted(ALL_PREFIXES, key=len, reverse=True)

# ---------------------------------------------------------------------------
# Core ID type alias
# ---------------------------------------------------------------------------

TypedID = str  # a str of the form "{prefix}{ulid26chars}"

# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def generate_id(prefix: str) -> TypedID:
    """Generate a new typed prefixed ULID ID.

    Args:
        prefix: One of the *_PREFIX constants, e.g. "ws_", "iss_".

    Returns:
        A string like "iss_01HXYZ...".

    Raises:
        ValueError: if prefix is not a recognised prefix.
    """
    if prefix not in ALL_PREFIXES:
        raise ValueError(
            f"Unknown prefix {prefix!r}. Valid prefixes: {sorted(ALL_PREFIXES)}"
        )
    return f"{prefix}{ULID()!s}"


# Convenience per-type generators
def gen_ws_id() -> TypedID:
    return generate_id(WS_PREFIX)


def gen_proj_id() -> TypedID:
    return generate_id(PROJ_PREFIX)


def gen_epic_id() -> TypedID:
    return generate_id(EPIC_PREFIX)


def gen_iss_id() -> TypedID:
    return generate_id(ISS_PREFIX)


def gen_task_id() -> TypedID:
    return generate_id(TASK_PREFIX)


def gen_subtask_id() -> TypedID:
    return generate_id(SUBTASK_PREFIX)


def gen_prd_id() -> TypedID:
    return generate_id(PRD_PREFIX)


def gen_plan_id() -> TypedID:
    return generate_id(PLAN_PREFIX)


def gen_run_id() -> TypedID:
    return generate_id(RUN_PREFIX)


def gen_wt_id() -> TypedID:
    return generate_id(WT_PREFIX)


def gen_rev_id() -> TypedID:
    return generate_id(REV_PREFIX)


def gen_art_id() -> TypedID:
    return generate_id(ART_PREFIX)


def gen_mem_id() -> TypedID:
    return generate_id(MEM_PREFIX)


def gen_hof_id() -> TypedID:
    return generate_id(HOF_PREFIX)


def gen_ac_id() -> TypedID:
    return generate_id(AC_PREFIX)


def gen_evt_id() -> TypedID:
    return generate_id(EVT_PREFIX)


def gen_team_id() -> TypedID:
    return generate_id(TEAM_PREFIX)


def gen_agent_id() -> TypedID:
    return generate_id(AGENT_PREFIX)


def gen_cycle_id() -> TypedID:
    return generate_id(CYCLE_PREFIX)


def gen_mile_id() -> TypedID:
    return generate_id(MILE_PREFIX)


def gen_wf_id() -> TypedID:
    return generate_id(WF_PREFIX)


# ---------------------------------------------------------------------------
# Parsing & validation
# ---------------------------------------------------------------------------


def parse_prefix(id_str: str) -> str:
    """Extract the prefix from a typed ID.

    Tries longest match first so "subtask_" beats "task_".

    Args:
        id_str: A typed ID string.

    Returns:
        The prefix string (e.g. "iss_").

    Raises:
        ValueError: if no known prefix is found.
    """
    for prefix in _SORTED_PREFIXES:
        if id_str.startswith(prefix):
            return prefix
    raise ValueError(f"No known prefix found in ID: {id_str!r}")


def is_valid_id(id_str: str, expected_prefix: str | None = None) -> bool:
    """Validate a typed prefixed ULID ID.

    Checks that:
    - The string starts with a known prefix (or the specified expected_prefix).
    - The remainder is a valid 26-character Crockford Base32 ULID.

    Args:
        id_str: The ID string to validate.
        expected_prefix: If provided, also assert the prefix matches this value.

    Returns:
        True if valid, False otherwise.
    """
    if not isinstance(id_str, str):
        return False

    try:
        prefix = parse_prefix(id_str)
    except ValueError:
        return False

    if expected_prefix is not None and prefix != expected_prefix:
        return False

    ulid_part = id_str[len(prefix):]
    # A ULID string is exactly 26 Crockford Base32 characters
    if len(ulid_part) != 26:
        return False

    try:
        ULID.from_str(ulid_part)
    except (ValueError, Exception):
        return False

    return True


# ---------------------------------------------------------------------------
# Display ID helpers
# ---------------------------------------------------------------------------

# Mapping from prefix to the human label used in display IDs
_PREFIX_TO_LABEL: dict[str, str] = {
    WS_PREFIX: "WS",
    PROJ_PREFIX: "PROJ",
    EPIC_PREFIX: "EPIC",
    ISS_PREFIX: "ISS",
    TASK_PREFIX: "TASK",
    SUBTASK_PREFIX: "SUB",
    PRD_PREFIX: "PRD",
    PLAN_PREFIX: "PLAN",
    RUN_PREFIX: "RUN",
    WT_PREFIX: "WT",
    REV_PREFIX: "REV",
    ART_PREFIX: "ART",
    MEM_PREFIX: "MEM",
    HOF_PREFIX: "HOF",
    AC_PREFIX: "AC",
    EVT_PREFIX: "EVT",
    TEAM_PREFIX: "TEAM",
    AGENT_PREFIX: "AGENT",
    CYCLE_PREFIX: "CYCLE",
    MILE_PREFIX: "MILE",
    WF_PREFIX: "WF",
}


def display_id(typed_id: str) -> str:
    """Produce a compact human-readable display ID from a typed ULID.

    Uses the last 6 characters of the ULID portion as the suffix.

    Example:
        "iss_01HXYZ...ABCDEF"  ->  "ISS-ABCDEF"

    Args:
        typed_id: A valid typed ULID ID.

    Returns:
        A display string like "ISS-AB3X4Y".

    Raises:
        ValueError: if the ID is not a valid typed ULID.
    """
    prefix = parse_prefix(typed_id)
    label = _PREFIX_TO_LABEL.get(prefix, prefix.rstrip("_").upper())
    ulid_part = typed_id[len(prefix):]
    suffix = ulid_part[-6:].upper()
    return f"{label}-{suffix}"
