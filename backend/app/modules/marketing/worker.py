from __future__ import annotations

import logging
import uuid
from collections.abc import Callable

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.marketing.browser.publisher import (
    FacebookFeedPublisher,
    PlaywrightFacebookFeedPublisher,
    PublishResult,
    StubFacebookFeedPublisher,
)
from app.modules.marketing.crypto import build_marketing_crypto

logger = logging.getLogger(__name__)

__all__ = [
    "FacebookFeedPublisher",
    "PlaywrightFacebookFeedPublisher",
    "PublishResult",
    "StubFacebookFeedPublisher",
    "run_marketing_facebook_post_task",
]


def _default_publisher() -> FacebookFeedPublisher:
    return PlaywrightFacebookFeedPublisher()


def _publisher_error_message(exc: BaseException) -> str:
    message = str(exc).strip()
    if not message:
        return "Publisher error"
    lowered = message.lower()
    if "@" in message or "password" in lowered or "email" in lowered:
        return "Publisher error"
    return message


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
        try:
            email = crypto.decrypt_str(agent.fb_email_encrypted)
            password = crypto.decrypt_str(agent.fb_password_encrypted)
            storage_state = (
                crypto.decrypt_json(agent.storage_state_encrypted)
                if agent.storage_state_encrypted
                else None
            )
        except Exception:
            logger.exception(
                "marketing facebook post credential decrypt failed task_id=%s",
                task_id,
            )
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error="Failed to decrypt agent credentials",
            )
            uow.commit()
            return

        logger.info(
            "marketing facebook post started task_id=%s agent_id=%s",
            task_id,
            agent.id,
        )

        try:
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
        except Exception as exc:
            logger.exception(
                "marketing facebook post publisher raised task_id=%s", task_id
            )
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error=_publisher_error_message(exc),
            )

        uow.commit()
