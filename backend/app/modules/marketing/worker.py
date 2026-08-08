from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable
from typing import Any

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.marketing.browser.publisher import (
    FacebookFeedPublisher,
    PlaywrightFacebookFeedPublisher,
    PublishResult,
    StubFacebookFeedPublisher,
)
from app.modules.marketing.browser.session import (
    decode_storage_state,
    encode_storage_state,
)
from app.modules.marketing.crypto import MarketingCrypto, build_marketing_crypto

logger = logging.getLogger(__name__)

PUBLISH_TIMEOUT_SECONDS = 120

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


def _safe_fail_task(
    task_id: uuid.UUID,
    error: str,
    uow_factory: Callable[[], SqlAlchemyUnitOfWork],
) -> None:
    try:
        with uow_factory() as uow:
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error=error,
            )
            uow.commit()
    except Exception:
        logger.exception(
            "marketing facebook post could not persist failure task_id=%s",
            task_id,
        )


async def run_marketing_facebook_post_task(
    task_id: uuid.UUID,
    *,
    publisher: FacebookFeedPublisher | None = None,
    uow_factory: Callable[[], SqlAlchemyUnitOfWork] = SqlAlchemyUnitOfWork,
) -> None:
    publisher = publisher or _default_publisher()
    task_found = False
    try:
        task_found = await _run_marketing_facebook_post_task(
            task_id,
            publisher=publisher,
            uow_factory=uow_factory,
        )
    except Exception as exc:
        logger.exception("marketing facebook post worker failed task_id=%s", task_id)
        if task_found:
            _safe_fail_task(
                task_id,
                _publisher_error_message(exc),
                uow_factory,
            )


async def _run_marketing_facebook_post_task(
    task_id: uuid.UUID,
    *,
    publisher: FacebookFeedPublisher,
    uow_factory: Callable[[], SqlAlchemyUnitOfWork],
) -> bool:
    agent_id: uuid.UUID
    message: str

    with uow_factory() as uow:
        task = uow.marketing.get_task_by_id(task_id)
        if task is None:
            logger.warning("marketing task not found task_id=%s", task_id)
            return False

        agent_id = task.agent_id
        message = task.message
        uow.marketing.mark_task_running(task_id)
        uow.commit()

    crypto: MarketingCrypto
    email: str
    password: str
    storage_state: dict[str, Any] | None

    with uow_factory() as uow:
        agent = uow.marketing.get_agent(agent_id)
        if agent is None:
            uow.marketing.mark_task_finished(
                task_id,
                status="failed",
                error="Marketing agent not found",
            )
            uow.commit()
            return True

        crypto = build_marketing_crypto()
        try:
            email = crypto.decrypt_str(agent.fb_email_encrypted)
            password = crypto.decrypt_str(agent.fb_password_encrypted)
            storage_state = decode_storage_state(
                crypto, agent.storage_state_encrypted
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
            return True

    logger.info(
        "marketing facebook post started task_id=%s agent_id=%s",
        task_id,
        agent_id,
    )

    try:
        publish_result = await asyncio.wait_for(
            publisher.publish(
                email=email,
                password=password,
                storage_state=storage_state,
                message=message,
            ),
            timeout=PUBLISH_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.exception(
            "marketing facebook post publisher timed out task_id=%s", task_id
        )
        _safe_fail_task(task_id, "Publish timed out", uow_factory)
        return True
    except Exception as exc:
        logger.exception(
            "marketing facebook post publisher raised task_id=%s", task_id
        )
        _safe_fail_task(task_id, _publisher_error_message(exc), uow_factory)
        return True

    with uow_factory() as uow:
        if publish_result.storage_state is not None:
            uow.marketing.update_agent_session(
                agent_id,
                storage_state_encrypted=encode_storage_state(
                    crypto, publish_result.storage_state
                ),
            )

        if publish_result.ok:
            uow.marketing.mark_task_finished(
                task_id,
                status="succeeded",
                result=publish_result.result,
            )
            logger.info("marketing facebook post succeeded task_id=%s", task_id)
        elif publish_result.needs_manual_intervention:
            uow.marketing.mark_agent_status(agent_id, "needs_manual_intervention")
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

    return True
