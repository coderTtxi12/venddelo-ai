from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any, Protocol

logger = logging.getLogger(__name__)

_MISSING_GCP_CONFIG = (
    ("gcp_project", "GCP_PROJECT"),
    ("cloud_tasks_queue", "CLOUD_TASKS_QUEUE"),
    ("delivery_tasks_handler_url", "DELIVERY_TASKS_HANDLER_URL"),
    ("delivery_tasks_secret", "DELIVERY_TASKS_SECRET"),
)


class CloudTasksClient(Protocol):
    def queue_path(self, project: str, location: str, queue: str) -> str: ...

    def create_task(self, request: dict[str, Any] | None = None, **kwargs: Any) -> Any: ...


class GcpTaskBus:
    def __init__(
        self,
        *,
        client: CloudTasksClient,
        project: str,
        location: str,
        queue: str,
        handler_url: str,
        secret: str,
    ) -> None:
        self._client = client
        self._parent = client.queue_path(project, location, queue)
        self._handler_url = handler_url
        self._secret = secret

    @classmethod
    def from_settings(cls, settings: Any) -> GcpTaskBus:
        missing = [
            env_name
            for attr, env_name in _MISSING_GCP_CONFIG
            if not getattr(settings, attr, None)
        ]
        if missing:
            raise ValueError("Cloud Tasks GCP config missing: " + ", ".join(missing))
        from google.cloud import tasks_v2

        return cls(
            client=tasks_v2.CloudTasksClient(),
            project=str(settings.gcp_project),
            location=str(getattr(settings, "cloud_tasks_location", None) or "us-central1"),
            queue=str(settings.cloud_tasks_queue),
            handler_url=str(settings.delivery_tasks_handler_url),
            secret=str(settings.delivery_tasks_secret),
        )

    def enqueue(self, kind: str, eta: datetime, payload: dict) -> None:
        schedule = eta if eta.tzinfo is not None else eta.replace(tzinfo=UTC)
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        task = {
            "http_request": {
                "http_method": "POST",
                "url": self._handler_url,
                "headers": {
                    "Content-Type": "application/json",
                    "X-Delivery-Tasks-Secret": self._secret,
                },
                "body": body,
            },
            "schedule_time": schedule,
        }
        self._client.create_task(request={"parent": self._parent, "task": task})
        logger.info(
            "cloud tasks enqueued kind=%s request_id=%s eta=%s",
            kind,
            payload.get("request_id"),
            schedule.isoformat(),
        )
