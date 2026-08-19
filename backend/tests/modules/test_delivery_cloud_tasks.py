from contextvars import copy_context
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.modules.delivery_dispatch.cloud_tasks import GcpTaskBus
from app.modules.delivery_dispatch.tasks import (
    discard_delivery_tasks,
    enqueue,
    flush_delivery_tasks,
    stub_bus,
)


class _FakeTasksClient:
    def __init__(self) -> None:
        self.created: list[dict] = []

    def queue_path(self, project: str, location: str, queue: str) -> str:
        return f"projects/{project}/locations/{location}/queues/{queue}"

    def create_task(self, request=None, **kwargs):
        self.created.append(request or kwargs)
        return SimpleNamespace(name="projects/p/locations/l/queues/q/tasks/t")


def _bus(client: _FakeTasksClient | None = None) -> tuple[GcpTaskBus, _FakeTasksClient]:
    fake = client or _FakeTasksClient()
    return (
        GcpTaskBus(
            client=fake,
            project="venddelo",
            location="us-central1",
            queue="delivery-dispatch",
            handler_url="https://api.example.com/api/v1/internal/delivery/tasks",
            secret="s3cret",
        ),
        fake,
    )


def setup_function() -> None:
    stub_bus.clear()
    discard_delivery_tasks()


def teardown_function() -> None:
    stub_bus.clear()
    discard_delivery_tasks()


def test_gcp_bus_posts_json_at_schedule_time() -> None:
    bus, client = _bus()
    eta = datetime(2026, 8, 19, 3, 0, tzinfo=UTC)
    payload = {"kind": "search", "request_id": "req-1"}

    bus.enqueue("search", eta, payload)

    assert len(client.created) == 1
    request = client.created[0]
    assert request["parent"] == "projects/venddelo/locations/us-central1/queues/delivery-dispatch"
    task = request["task"]
    http = task["http_request"]
    assert http["url"] == "https://api.example.com/api/v1/internal/delivery/tasks"
    assert http["headers"]["Content-Type"] == "application/json"
    assert http["headers"]["X-Delivery-Tasks-Secret"] == "s3cret"
    assert b'"kind":"search"' in http["body"]
    assert b'"request_id":"req-1"' in http["body"]
    assert task["schedule_time"] == eta


def test_gcp_bus_treats_naive_eta_as_utc() -> None:
    bus, client = _bus()
    eta = datetime(2026, 8, 19, 3, 0)

    bus.enqueue("retry", eta, {"kind": "retry", "request_id": "req-2"})

    assert client.created[0]["task"]["schedule_time"] == eta.replace(tzinfo=UTC)


def test_gcp_bus_from_settings_requires_project_queue_url_and_secret() -> None:
    with pytest.raises(ValueError, match="GCP_PROJECT"):
        GcpTaskBus.from_settings(
            SimpleNamespace(
                gcp_project=None,
                cloud_tasks_location="us-central1",
                cloud_tasks_queue="delivery-dispatch",
                delivery_tasks_handler_url="https://api.example.com/api/v1/internal/delivery/tasks",
                delivery_tasks_secret="s3cret",
            )
        )


def test_stub_enqueue_stays_in_memory() -> None:
    eta = datetime.now(UTC) + timedelta(seconds=10)
    with patch(
        "app.modules.delivery_dispatch.tasks.get_settings",
        return_value=SimpleNamespace(delivery_tasks_backend="stub"),
    ):
        enqueue("search", eta, {"kind": "search", "request_id": "req-stub"})
    assert any(job.payload["request_id"] == "req-stub" for job in stub_bus.jobs)


def test_gcp_enqueue_waits_until_flush() -> None:
    client = _FakeTasksClient()
    bus, _ = _bus(client)
    settings = SimpleNamespace(delivery_tasks_backend="gcp")
    eta = datetime.now(UTC)

    with (
        patch("app.modules.delivery_dispatch.tasks.get_settings", return_value=settings),
        patch("app.modules.delivery_dispatch.tasks._gcp_bus", bus),
    ):
        enqueue("search", eta, {"kind": "search", "request_id": "req-gcp"})
        assert client.created == []
        assert stub_bus.jobs == []
        flush_delivery_tasks()

    assert len(client.created) == 1
    body = client.created[0]["task"]["http_request"]["body"]
    assert b"req-gcp" in body


def test_gcp_flush_keeps_jobs_when_route_and_teardown_use_different_contexts() -> None:
    """FastAPI copies context into each threadpool hop; ContextVar cannot carry the buffer."""

    class _Session:
        def __init__(self) -> None:
            self.info: dict = {}

    session = _Session()
    client = _FakeTasksClient()
    bus, _ = _bus(client)
    settings = SimpleNamespace(delivery_tasks_backend="gcp")
    eta = datetime.now(UTC)

    with (
        patch("app.modules.delivery_dispatch.tasks.get_settings", return_value=settings),
        patch("app.modules.delivery_dispatch.tasks._gcp_bus", bus),
    ):
        copy_context().run(
            lambda: enqueue(
                "search",
                eta,
                {"kind": "search", "request_id": "req-session"},
                session=session,
            )
        )
        copy_context().run(lambda: flush_delivery_tasks(session))

    assert len(client.created) == 1
    body = client.created[0]["task"]["http_request"]["body"]
    assert b"req-session" in body


def test_discard_drops_buffered_gcp_tasks() -> None:
    client = _FakeTasksClient()
    bus, _ = _bus(client)
    settings = SimpleNamespace(delivery_tasks_backend="gcp")

    with (
        patch("app.modules.delivery_dispatch.tasks.get_settings", return_value=settings),
        patch("app.modules.delivery_dispatch.tasks._gcp_bus", bus),
    ):
        enqueue("search", datetime.now(UTC), {"kind": "search", "request_id": "req-drop"})
        discard_delivery_tasks()
        flush_delivery_tasks()

    assert client.created == []
