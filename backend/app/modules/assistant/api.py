"""Restaurant assistant HTTP API (OpenAI Agents SDK orchestration)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, require_owned_restaurant
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.llm.ports import ChatStreamEvent
from app.core.security import AuthenticatedUser
from app.db.uow import SqlAlchemyUnitOfWork, finish_uow_gen, get_uow
from app.modules.assistant.agent.service import AssistantAgentService
from app.modules.assistant.agent.workflow.clarify_registry import get_clarify_registry
from app.modules.assistant.import_assets import upload_import_asset
from app.modules.assistant.schemas import (
    AssistantChatRequest,
    AssistantClarifyAnswerRequest,
    ImportAssetUploadDTO,
)
from app.modules.assistant.skills.menu_import.session_context import (
    cancel_active_import_for_restaurant,
)
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["assistant"])


def _agent_service() -> AssistantAgentService:
    return AssistantAgentService()


@router.post(
    "/restaurants/{restaurant_id}/assistant/import/assets",
    response_model=ImportAssetUploadDTO,
    status_code=status.HTTP_201_CREATED,
)
def upload_assistant_import_asset(
    file: UploadFile = File(...),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
) -> ImportAssetUploadDTO:
    """Upload a chat attachment into the restaurant import inbox (WebP for images)."""
    content = file.file.read()
    return upload_import_asset(
        restaurant.id,
        file.filename or "upload",
        content,
        file.content_type or "application/octet-stream",
    )


@router.post("/restaurants/{restaurant_id}/assistant/conversations/reset")
def reset_assistant_conversation(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> dict[str, bool]:
    """Start a fresh chat + menu-import context (cancels any active import for this restaurant)."""
    cancel_active_import_for_restaurant(uow, restaurant_id=restaurant.id)
    uow.commit()
    return {"ok": True}


@router.post("/restaurants/{restaurant_id}/assistant/clarify/answer")
async def answer_assistant_clarify(
    body: AssistantClarifyAnswerRequest,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),  # noqa: ARG001
) -> dict[str, bool]:
    """Resolve a pending clarify prompt for an in-flight chat stream.

    Ownership is enforced via ``require_owned_restaurant`` on the restaurant
    scoping the URL; the ``clarify_id`` itself is an unguessable UUID minted
    per-prompt, which is sufficient secrecy for this MVP endpoint.
    """
    try:
        get_clarify_registry().resolve(
            body.conversation_id, body.clarify_id, body.user_response
        )
    except KeyError as exc:
        raise NotFoundError("No pending clarify for this id") from exc
    return {"ok": True}


@router.post("/restaurants/{restaurant_id}/assistant/chat")
async def assistant_chat(
    request: Request,
    restaurant_id: uuid.UUID,
    body: AssistantChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: AssistantAgentService = Depends(_agent_service),
) -> StreamingResponse:
    """Stream one assistant turn via SSE (OpenAI Agents SDK, menu_read tools only for now)."""
    try:
        service._require_openai_api_key()
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc

    # Ownership check uses a short-lived UoW. FastAPI would otherwise keep the
    # request session checked out for the entire OpenAI SSE stream.
    uow_dep = request.app.dependency_overrides.get(get_uow, get_uow)
    uow_gen = uow_dep()
    uow = next(uow_gen)
    try:
        restaurant = require_owned_restaurant(restaurant_id, user, uow)
    finally:
        finish_uow_gen(uow_gen)

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for event in service.stream_chat(
                restaurant_id=restaurant.id,
                message=body.message,
                conversation_id=body.conversation_id,
                attachments=body.attachments,
            ):
                yield service.format_sse(event)
        except ValueError as exc:
            yield service.format_sse(
                ChatStreamEvent(
                    event="error",
                    data={"code": "assistant_error", "message": str(exc)},
                )
            )
        except NotFoundError as exc:
            yield service.format_sse(
                ChatStreamEvent(
                    event="error",
                    data={"code": "conversation_not_found", "message": str(exc)},
                )
            )
        except ForbiddenError as exc:
            yield service.format_sse(
                ChatStreamEvent(
                    event="error",
                    data={"code": "forbidden", "message": str(exc)},
                )
            )
        except Exception as exc:  # noqa: BLE001 - surfaced to client as SSE error event
            yield service.format_sse(
                ChatStreamEvent(
                    event="error",
                    data={"code": "assistant_error", "message": str(exc)},
                )
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
