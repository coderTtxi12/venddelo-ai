import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from app.modules.delivery_dispatch.monitor_cache import DispatchMonitorSnapshotCache


def test_dispatch_monitor_cache_reuses_value_within_ttl() -> None:
    now = 100.0
    cache = DispatchMonitorSnapshotCache(clock=lambda: now)
    provider_id = uuid.uuid4()
    calls = 0

    def build() -> object:
        nonlocal calls
        calls += 1
        return {"calls": calls}

    first = cache.get_or_build(provider_id, None, ttl_seconds=2, build=build)
    second = cache.get_or_build(provider_id, None, ttl_seconds=2, build=build)

    assert first == second
    assert calls == 1


def test_dispatch_monitor_cache_expires_and_invalidates_provider() -> None:
    now = 100.0
    cache = DispatchMonitorSnapshotCache(clock=lambda: now)
    provider_id = uuid.uuid4()
    zone_id = uuid.uuid4()
    calls = 0

    def build() -> object:
        nonlocal calls
        calls += 1
        return {"calls": calls}

    assert cache.get_or_build(provider_id, zone_id, ttl_seconds=2, build=build) == {"calls": 1}

    now = 103.0
    assert cache.get_or_build(provider_id, zone_id, ttl_seconds=2, build=build) == {"calls": 2}

    cache.invalidate_provider(provider_id)
    assert cache.get_or_build(provider_id, zone_id, ttl_seconds=2, build=build) == {"calls": 3}


def test_dispatch_monitor_cache_coalesces_concurrent_misses() -> None:
    cache = DispatchMonitorSnapshotCache(clock=lambda: 100.0)
    provider_id = uuid.uuid4()
    first_build_started = Event()
    release_first_build = Event()
    second_call_started = Event()
    calls = 0

    def build() -> object:
        nonlocal calls
        calls += 1
        first_build_started.set()
        assert release_first_build.wait(timeout=1)
        return {"snapshot": "shared"}

    def get_second() -> object:
        second_call_started.set()
        return cache.get_or_build(provider_id, None, ttl_seconds=2, build=build)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            cache.get_or_build,
            provider_id,
            None,
            ttl_seconds=2,
            build=build,
        )
        assert first_build_started.wait(timeout=1)
        second = executor.submit(get_second)
        assert second_call_started.wait(timeout=1)
        assert calls == 1
        release_first_build.set()

        assert first.result(timeout=1) is second.result(timeout=1)
        assert calls == 1
