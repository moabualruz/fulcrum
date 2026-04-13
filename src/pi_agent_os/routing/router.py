"""Routing logic: role → PI profile resolution with fallback chains. Spec §16.4."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
from .roles import RoleMapping, load_role_mappings, can_invoke_team, L1_ROLES


@dataclass
class RouteDecision:
    """The result of a routing decision."""
    role: str
    resolved_profile: Optional[str]       # PI profile ID (None = stub/default)
    resolved_model: Optional[str]
    resolved_provider: Optional[str]
    fallback_used: bool = False
    fallback_chain: list[str] = field(default_factory=list)  # profiles tried
    note: str = ""


class Router:
    """
    Resolves execution targets for tasks/workflows.

    Routing order per spec §16.4:
    1. task/workflow requirement
    2. team slot preferred PI profile
    3. role default PI profile
    4. explicit fallback PI profile
    5. escalate back to L1 if no fit
    """

    def __init__(self, role_mappings: dict[str, RoleMapping] | None = None):
        self._mappings = role_mappings or load_role_mappings()

    def resolve(
        self,
        role: str,
        preferred_profile: Optional[str] = None,
        task_requirement: Optional[str] = None,
        allow_fallback: bool = True,
    ) -> RouteDecision:
        """
        Resolve a role to a PI profile.

        Returns RouteDecision with the resolved profile (or None if no PI available).
        """
        mapping = self._mappings.get(role)
        fallback_chain = []

        # Step 1: task/workflow explicit requirement overrides all
        if task_requirement:
            fallback_chain.append(task_requirement)
            return RouteDecision(
                role=role,
                resolved_profile=task_requirement,
                resolved_model=None,
                resolved_provider=None,
                fallback_used=False,
                fallback_chain=fallback_chain,
                note="task requirement override",
            )

        # Step 2: team slot preferred profile
        if preferred_profile:
            fallback_chain.append(preferred_profile)
            return RouteDecision(
                role=role,
                resolved_profile=preferred_profile,
                resolved_model=None,
                resolved_provider=None,
                fallback_used=False,
                fallback_chain=fallback_chain,
                note="team slot preferred",
            )

        # Step 3: role default PI profile
        if mapping and mapping.primary_profile:
            fallback_chain.append(mapping.primary_profile)
            return RouteDecision(
                role=role,
                resolved_profile=mapping.primary_profile,
                resolved_model=mapping.default_model,
                resolved_provider=mapping.default_provider,
                fallback_used=False,
                fallback_chain=fallback_chain,
                note="role default",
            )

        # Step 4: explicit fallback chain
        if allow_fallback and mapping and mapping.fallback_profiles:
            for fallback in mapping.fallback_profiles:
                fallback_chain.append(fallback)
                return RouteDecision(
                    role=role,
                    resolved_profile=fallback,
                    resolved_model=None,
                    resolved_provider=None,
                    fallback_used=True,
                    fallback_chain=fallback_chain,
                    note="fallback chain",
                )

        # Step 5: no fit — escalate to L1
        return RouteDecision(
            role=role,
            resolved_profile=None,
            resolved_model=None,
            resolved_provider=None,
            fallback_used=False,
            fallback_chain=fallback_chain,
            note="no profile available — escalate to L1",
        )

    def select_execution_shape(
        self,
        request_complexity: str,  # "simple"|"planning"|"multi_phase"|"parallel"
        requires_specialties: list[str],
        actor_role: str,
    ) -> str:
        """
        L1 decision: choose execution shape.

        Returns: "native_skill"|"single_agent"|"coded_workflow"|"team"

        Spec §15.5, §15.6
        """
        # Teams: only L1 can decide, and only for complex/parallel work
        if actor_role not in L1_ROLES:
            # Non-L1 may only recommend, never decide team usage
            if request_complexity in ("multi_phase", "parallel"):
                return "single_agent"  # fallback
            return "native_skill"

        # L1 selection logic per spec §15.6
        if request_complexity == "simple":
            return "native_skill"
        elif request_complexity == "planning":
            return "coded_workflow"
        elif request_complexity in ("multi_phase", "parallel") and len(requires_specialties) > 1:
            return "team"
        else:
            return "single_agent"
