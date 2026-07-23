from __future__ import annotations

from typing import Literal

from app.core.exceptions import ForbiddenError

DeliveryProviderMemberRole = Literal["owner", "admin", "operator", "dispatcher", "driver"]
InvitableMemberRole = Literal["admin", "operator"]

_WRITE_CONFIG_ROLES = frozenset({"owner", "admin"})
_OPERATOR_WRITE_ROLES = frozenset({"owner", "admin", "operator"})


def can_manage_members(role: str | None) -> bool:
    return role == "owner"


def can_write_provider_config(role: str | None) -> bool:
    return role in _WRITE_CONFIG_ROLES


def can_manage_partnerships(role: str | None) -> bool:
    return role in _OPERATOR_WRITE_ROLES


def can_manage_weather(role: str | None) -> bool:
    return role in _OPERATOR_WRITE_ROLES


def can_simulate_pricing(role: str | None) -> bool:
    return role in _OPERATOR_WRITE_ROLES


def require_write_provider_config(role: str | None) -> None:
    if not can_write_provider_config(role):
        raise ForbiddenError("Tu rol no permite modificar esta configuración")


def require_manage_weather(role: str | None) -> None:
    if not can_manage_weather(role):
        raise ForbiddenError("Tu rol no permite modificar el clima operativo")


def require_manage_partnerships(role: str | None) -> None:
    if not can_manage_partnerships(role):
        raise ForbiddenError("Tu rol no permite gestionar solicitudes de restaurantes")
