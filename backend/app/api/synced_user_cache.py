from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass

from app.core.security import AuthenticatedUser
from app.modules.users.schemas import UserDTO


@dataclass(frozen=True)
class _CacheEntry:
    fingerprint: tuple[str | None, str | None, str | None, str | None]
    user: UserDTO
    expires_at: float


class SyncedUserCache:
    """Small per-instance cache to avoid syncing the same JWT claims on every request."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._entries: dict[uuid.UUID, _CacheEntry] = {}

    def get(self, auth: AuthenticatedUser, *, ttl_seconds: int) -> UserDTO | None:
        if ttl_seconds <= 0:
            return None
        entry = self._entries.get(auth.id)
        if entry is None:
            return None
        if entry.expires_at <= self._clock():
            self._entries.pop(auth.id, None)
            return None
        if entry.fingerprint != self._fingerprint(auth):
            self._entries.pop(auth.id, None)
            return None
        return entry.user

    def set(self, auth: AuthenticatedUser, user: UserDTO, *, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        self._entries[auth.id] = _CacheEntry(
            fingerprint=self._fingerprint(auth),
            user=user,
            expires_at=self._clock() + ttl_seconds,
        )

    def clear(self) -> None:
        self._entries.clear()

    @staticmethod
    def _fingerprint(
        auth: AuthenticatedUser,
    ) -> tuple[str | None, str | None, str | None, str | None]:
        return (auth.email, auth.display_name, auth.avatar_url, auth.role)


synced_user_cache = SyncedUserCache()
