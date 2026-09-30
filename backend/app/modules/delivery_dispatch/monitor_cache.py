from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from typing import TypeVar

T = TypeVar("T")


@dataclass
class _Entry:
    value: object
    expires_at: float


class DispatchMonitorSnapshotCache:
    """Tiny per-instance cache for repeated monitor snapshots."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._entries: dict[tuple[uuid.UUID, uuid.UUID | None], _Entry] = {}
        self._guard = Lock()
        self._build_locks: dict[tuple[uuid.UUID, uuid.UUID | None], Lock] = {}

    def _get_live(
        self,
        key: tuple[uuid.UUID, uuid.UUID | None],
        now: float,
    ) -> _Entry | None:
        with self._guard:
            entry = self._entries.get(key)
            if entry is not None and entry.expires_at > now:
                return entry
            return None

    def get_or_build(
        self,
        provider_id: uuid.UUID,
        zone_id: uuid.UUID | None,
        *,
        ttl_seconds: int,
        build: Callable[[], T],
    ) -> T:
        if ttl_seconds <= 0:
            return build()
        key = (provider_id, zone_id)
        now = self._clock()
        entry = self._get_live(key, now)
        if entry is not None:
            return entry.value  # type: ignore[return-value]
        with self._guard:
            build_lock = self._build_locks.setdefault(key, Lock())
        with build_lock:
            now = self._clock()
            entry = self._get_live(key, now)
            if entry is not None:
                return entry.value  # type: ignore[return-value]
            value = build()
            with self._guard:
                self._entries[key] = _Entry(
                    value=value,
                    expires_at=self._clock() + ttl_seconds,
                )
            return value

    def invalidate_provider(self, provider_id: uuid.UUID) -> None:
        with self._guard:
            keys = [key for key in self._entries if key[0] == provider_id]
            for key in keys:
                self._entries.pop(key, None)


dispatch_monitor_snapshot_cache = DispatchMonitorSnapshotCache()
