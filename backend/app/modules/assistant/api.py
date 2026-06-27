from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import StreamingResponse

from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.conversation_service import AssistantConversationService
from app.modules.assistant.schemas import (
    AssistantConversationChatRequest,
    AssistantConversationCreate,
    AssistantConversationDTO,
    AssistantConversationUpdate,
    AssistantMessageDTO,
)
from app.modules.assistant.service import AssistantService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["assistant"])


def _conversation_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> AssistantConversationService:
    return AssistantConversationService(uow.assistant, provider=build_llm_provider())


@router.get(
    "/restaurants/{restaurant_id}/assistant/conversations",
    response_model=CursorPage[AssistantConversationDTO],
)
def list_conversations(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> CursorPage[AssistantConversationDTO]:
    return service.list_conversations(restaurant.id, params)


@router.post(
    "/restaurants/{restaurant_id}/assistant/conversations",
    response_model=AssistantConversationDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
    body: AssistantConversationCreate = AssistantConversationCreate(),
) -> AssistantConversationDTO:
    return service.create_conversation(restaurant.id, body)


@router.get(
    "/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationDTO,
)
def get_conversation(
    conversation_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> AssistantConversationDTO:
    return service.get_conversation(restaurant.id, conversation_id)


@router.get(
    "/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}/messages",
    response_model=CursorPage[AssistantMessageDTO],
)
def list_messages(
    conversation_id: uuid.UUID,
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> CursorPage[AssistantMessageDTO]:
    return service.list_messages(restaurant.id, conversation_id, params)


@router.patch(
    "/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationDTO,
)
def update_conversation(
    conversation_id: uuid.UUID,
    body: AssistantConversationUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> AssistantConversationDTO:
    return service.update_conversation(restaurant.id, conversation_id, body)


@router.delete(
    "/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> Response:
    service.delete_conversation(restaurant.id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}/chat")
def stream_conversation_chat(
    conversation_id: uuid.UUID,
    body: AssistantConversationChatRequest,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> StreamingResponse:
    restaurant_id = restaurant.id
    outbound_message = body.message
    service = AssistantConversationService(uow.assistant, provider=build_llm_provider())

    def event_generator():
        stream = service.stream_chat(
            restaurant_id,
            conversation_id,
            message=outbound_message,
        )
        try:
            for event in stream:
                yield AssistantService.format_sse(event)
            uow.commit()
        except GeneratorExit:
            uow.rollback()
            return
        except Exception:
            uow.rollback()
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
