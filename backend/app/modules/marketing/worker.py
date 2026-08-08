from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.marketing.crypto import build_marketing_crypto

logger = logging.getLogger(__name__)


@dataclass
class PublishResult:
    ok: bool
    storage_state: dict[str, Any] | None
    error: str | None = None
    needs_manual_intervention: bool = False
    result: dict[str, Any] | None = None


class FacebookFeedPublisher(Protocol):
    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, Any] | None,
        message: str,
    ) -> PublishResult: ...


class StubFacebookFeedPublisher:
    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, Any] | None,
        message: str,
    ) -> PublishResult:
        return PublishResult(ok=False, storage_state=None, error="publisher not wired")


def _default_publisher() -> FacebookFeedPublisher:
    return StubFacebookFeedPublisher()


async def run_marketing_facebook_post_task(
    task_id: uuid.UUID,
    *,
    publisher: FacebookFeedPublisher | None = None,
    uow_factory: Callable[[], SqlAlchemyUnitOfWork] = SqlAlchemyUnitOfWork,
) -> None:
    publisher = publisher or _default_publisher()
    with uow_factory() as uow:
        task = uow.marketing.get_task_by_id(task_id)
        if task is None:
            logger.warning("marketing task not found task_id=%s", task_id)
            return

        uow.marketing.mark_task_running(task_id)

        agent = uow.marketing.get_agent(task.agent_id)
        if agent is None:
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error="Marketing agent not found",
            )
            uow.commit()
            return

        crypto = build_marketing_crypto()
        email = crypto.decrypt_str(agent.fb_email_encrypted)
        password = crypto.decrypt_str(agent.fb_password_encrypted)
        storage_state = (
            crypto.decrypt_json(agent.storage_state_encrypted)
            if agent.storage_state_encrypted
            else None
        )

        logger.info(
            "marketing facebook post started task_id=%s agent_id=%s",
            task_id,
            agent.id,
        )

        publish_result = await publisher.publish(
            email=email,
            password=password,
            storage_state=storage_state,
            message=task.message,
        )

        if publish_result.ok:
            if publish_result.storage_state is not None:
                uow.marketing.update_agent_session(
                    agent.id,
                    storage_state_encrypted=crypto.encrypt_json(
                        publish_result.storage_state
                    ),
                )
            uow.marketing.mark_task_finished(
                task_id,
                status="succeeded",
                result=publish_result.result,
            )
            logger.info("marketing facebook post succeeded task_id=%s", task_id)
        elif publish_result.needs_manual_intervention:
            uow.marketing.mark_agent_status(agent.id, "needs_manual_intervention")
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error=publish_result.error or "Manual intervention required",
            )
            logger.warning(
                "marketing facebook post needs manual intervention task_id=%s",
                task_id,
            )
        else:
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error=publish_result.error or "Publish failed",
            )
            logger.warning(
                "marketing facebook post failed task_id=%s error=%s",
                task_id,
                publish_result.error,
            )

        uow.commit()
