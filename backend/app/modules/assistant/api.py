"""Restaurant assistant HTTP API.

All routes are scoped under ``/restaurants/{restaurant_id}/assistant/*`` and require
the authenticated user to own the restaurant (``require_owned_restaurant``).

Surface areas
-------------
Profile
    Identity, behavior, menu markdown, and enabled skills for the assistant persona.
    Entitlements (``granted`` vs ``effective`` skills) are resolved server-side from
    ``restaurant_assistant_entitlements`` (per-restaurant skill grants).

Conversations
    CRUD for chat threads and paginated message history. Messages are persisted in
    PostgreSQL; recent context is cached in Redis.

Chat (SSE)
    ``POST .../conversations/{conversation_id}/chat`` runs one agent turn in-process
    on Cloud Run: profile/entitlements → user message persist → lane lock →
    ``AgentOrchestrator`` (LLM JSON tool selection + read tools) → assistant message
    persist → ``uow.commit()``. See ``backend/docs/assistant-chat-streaming.md``.

Usage
    Aggregated LLM token/cost metering per restaurant (``assistant_llm_usage``).

Runtime wiring
--------------
- ``build_llm_provider()`` — OpenAI in prod, stub in dev/tests.
- ``build_skill_registry()`` — auto-discovers ``skills/*/`` (``SKILL.md`` + ``tools.py``).
- Profile is validated **before** opening the SSE stream so HTTP errors return as JSON.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.llm.factory import build_llm_provider
from app.infra.redis.factory import build_cache
from app.modules.assistant.conversation_service import AssistantConversationService
from app.modules.assistant.import_assets import upload_import_asset
from app.modules.assistant.profile.cache import AssistantProfileCache
from app.modules.assistant.profile.schemas import AssistantProfileResponse, AssistantProfileUpdate
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.schemas import (
    AssistantConversationChatRequest,
    AssistantConversationCreate,
    AssistantConversationDTO,
    AssistantConversationUpdate,
    AssistantMessageDTO,
    ImportAssetUploadDTO,
)
from app.modules.assistant.service import AssistantService
from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.usage.schemas import LLMUsageSummary
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["assistant"])


def _profile_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> AssistantProfileService:
    """FastAPI dependency: build ``AssistantProfileService`` for profile routes."""
    return AssistantProfileService(
        uow.assistant_profiles,
        uow.assistant_entitlements,
        uow.restaurants,
        cache=AssistantProfileCache(build_cache()),
    )


def _assistant_skill_registry():
    """Return the in-process skill registry (discovered from ``skills/*/``)."""
    return build_skill_registry()


def _conversation_service(
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> AssistantConversationService:
    """FastAPI dependency: conversation service with profile, LLM provider, and skills."""
    profile_service = AssistantProfileService(
        uow.assistant_profiles,
        uow.assistant_entitlements,
        uow.restaurants,
        cache=AssistantProfileCache(build_cache()),
    )
    return AssistantConversationService(
        uow.assistant,
        provider=build_llm_provider(),
        uow=uow,
        profile_service=profile_service,
        registry=_assistant_skill_registry(),
    )


@router.get(
    "/restaurants/{restaurant_id}/assistant/profile",
    response_model=AssistantProfileResponse,
)
def get_assistant_profile(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantProfileService = Depends(_profile_service),
) -> AssistantProfileResponse:
    """GET assistant profile for a restaurant.

    Returns identity/behavior/menu markdown, enabled skills, granted and effective
    skill ids, skills catalog (with lock reasons), version, and ``chat_ready`` flag.
    """
    return service.get_profile_response(restaurant.id)


@router.patch(
    "/restaurants/{restaurant_id}/assistant/profile",
    response_model=AssistantProfileResponse,
)
def update_assistant_profile(
    body: AssistantProfileUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantProfileService = Depends(_profile_service),
) -> AssistantProfileResponse:
    """PATCH assistant profile for a restaurant.

    Supports optimistic concurrency via ``expected_version``. Rejects
    ``enabled_skill_ids`` that are not granted for the owner plan (422).
    """
    return service.update_profile(restaurant.id, body)


@router.get(
    "/restaurants/{restaurant_id}/assistant/usage",
    response_model=LLMUsageSummary,
)
def get_assistant_usage(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> LLMUsageSummary:
    """GET aggregated LLM usage for a restaurant.

    Reads ``assistant_llm_usage`` (tokens, estimated cost). Metering is best-effort
    and does not block chat if inserts fail.
    """
    return uow.assistant_usage.summarize(restaurant.id)


@router.get(
    "/restaurants/{restaurant_id}/assistant/conversations",
    response_model=CursorPage[AssistantConversationDTO],
)
def list_conversations(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AssistantConversationService = Depends(_conversation_service),
) -> CursorPage[AssistantConversationDTO]:
    """GET paginated conversation list for a restaurant.

    Uses cursor pagination (``limit``, ``cursor``). First page may be served from Redis.
    """
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
    """POST a new conversation thread.

    Optional ``title``; defaults to ``Nueva conversación`` until the first chat turn
    renames it from the user message.
    """
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
    """GET one conversation by id.

    Returns 404 when the conversation does not exist or belongs to another restaurant.
    """
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
    """GET paginated messages for a conversation.

    Returns user/assistant turns with optional metadata (e.g. effective skills,
    compression info on assistant rows).
    """
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
    """PATCH conversation metadata.

    Update ``title`` and/or soft-archive via ``is_archived`` (sets inactive + deleted_at).
    """
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
    """DELETE (soft) a conversation.

    Marks the thread inactive; message history remains in the database.
    """
    service.delete_conversation(restaurant.id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/restaurants/{restaurant_id}/assistant/import/assets",
    response_model=ImportAssetUploadDTO,
    status_code=status.HTTP_201_CREATED,
)
def upload_import_asset_route(
    kind: str = Query(...),
    file: UploadFile = File(...),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
) -> ImportAssetUploadDTO:
    content = file.file.read()
    content_type = file.content_type or "application/octet-stream"
    return upload_import_asset(
        restaurant.id,
        kind,
        file.filename or "upload",
        content,
        content_type,
    )


@router.post("/restaurants/{restaurant_id}/assistant/conversations/{conversation_id}/chat")
def stream_conversation_chat(
    conversation_id: uuid.UUID,
    body: AssistantConversationChatRequest,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> StreamingResponse:
    """Stream one assistant turn as Server-Sent Events (SSE).

    Request
        ``message`` — owner turn (usually Spanish).
        ``profile_version`` — client-known profile version; required for optimistic sync.
        ``profile_snapshot`` — optional prompt snapshot; used only when version matches.
        ``confirmation_token`` / ``form_submission`` — reserved for future Plan-Act-Confirm.

    Pre-stream validation
        Profile must be chat-ready (e.g. ``display_name`` set). Failures return JSON
        before ``text/event-stream`` starts.

    SSE events (typical order)
        ``agent.phase`` — ``analyzing``, then ``explore`` if a tool runs.
        ``agent.status`` — ``processing`` while the agent works.
        ``tool.start`` / ``tool.result`` / ``tool.error`` — read tool lifecycle.
        ``content.delta`` — streamed Spanish markdown tokens from the final answer.
        ``message.complete`` — ``conversation_id``, ``message_id``, full ``content``.
        ``error`` — e.g. ``conversation_busy``, ``invalid_llm_json``, ``tool_not_entitled``.

    Persistence
        User message is written before streaming; assistant message, usage row, and
        conversation metadata are committed after a successful stream. Client disconnect
        rolls back the unit of work.
    """
    restaurant_id = restaurant.id
    profile_service = AssistantProfileService(
        uow.assistant_profiles,
        uow.assistant_entitlements,
        uow.restaurants,
        cache=AssistantProfileCache(build_cache()),
    )
    # Validate profile before opening SSE — Cloud Run runs the full agent turn in-process.
    profile_service.resolve_profile_for_chat(
        restaurant_id,
        profile_version=body.profile_version,
        profile_snapshot=body.profile_snapshot,
    )
    service = AssistantConversationService(
        uow.assistant,
        provider=build_llm_provider(),
        uow=uow,
        profile_service=profile_service,
        registry=_assistant_skill_registry(),
    )

    def event_generator():
        """Yield SSE-framed events and commit/rollback the request-scoped UoW."""
        stream = service.stream_chat(
            restaurant_id,
            conversation_id,
            message=body.message,
            attachments=body.attachments,
            profile_version=body.profile_version,
            profile_snapshot=body.profile_snapshot,
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
