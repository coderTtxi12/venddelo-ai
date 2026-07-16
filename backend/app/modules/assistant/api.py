"""Restaurant assistant HTTP API (OpenAI Agents SDK orchestration)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import require_owned_restaurant
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.assistant.agent.service import AssistantAgentService
from app.modules.assistant.import_assets import upload_import_asset
from app.modules.assistant.schemas import AssistantChatRequest, ImportAssetUploadDTO
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


@router.post("/restaurants/{restaurant_id}/assistant/chat")
async def assistant_chat(
    body: AssistantChatRequest,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    service: AssistantAgentService = Depends(_agent_service),
) -> StreamingResponse:
    """Stream one assistant turn via SSE (OpenAI Agents SDK, menu_read tools only for now)."""
    try:
        service._require_openai_api_key()
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for event in service.stream_chat(
                uow=uow,
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
