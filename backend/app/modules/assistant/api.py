from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import require_owned_restaurant
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.service import AssistantService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["assistant"])


def _service() -> AssistantService:
    return AssistantService(provider=build_llm_provider())


@router.post("/restaurants/{restaurant_id}/assistant/chat")
def stream_assistant_chat(
    body: AssistantChatRequest,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantService = Depends(_service),
) -> StreamingResponse:
    _ = restaurant

    def event_generator():
        for event in service.stream_chat(
            body,
            restaurant_id=str(restaurant.id),
        ):
            yield service.format_sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
