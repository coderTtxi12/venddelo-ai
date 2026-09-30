from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import require_owned_restaurant
from app.core.config import get_settings
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.developer.schemas import (
    DeveloperApiKeyCreate,
    DeveloperApiKeyCreatedDTO,
    DeveloperSettingsDTO,
    DeveloperWebhookDTO,
    DeveloperWebhookSecretDTO,
    DeveloperSentEventDTO,
    DeveloperSentEventsResponse,
    DeveloperWebhookTestResult,
    DeveloperWebhookUpdate,
)
from app.modules.developer.service import DeveloperSettingsService
from app.modules.developer.webhook_dispatch import deliver_test_webhook, sent_events_key
from app.modules.developer.webhook_sink import get_webhook_sink_store
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(prefix="/restaurants", tags=["developer"])

_PROD_API_ORIGIN = "https://venddelo-ai-backend-295432242625.northamerica-south1.run.app"


def webhook_api_v1_root(request: Request) -> str:
    """Public API origin for webhook test links.

    Cloud Run's incoming Host is often localhost, so request.base_url cannot
    be shown to restaurants. Production uses the public Cloud Run URL.
    """
    settings = get_settings()
    prefix = settings.api_v1_prefix
    if not prefix.startswith("/"):
        prefix = f"/{prefix}"
    prefix = prefix.rstrip("/")
    configured = (settings.public_api_base_url or "").strip().rstrip("/")
    if not configured and settings.app_env == "prod":
        configured = _PROD_API_ORIGIN
    if configured:
        if configured.endswith(prefix):
            return configured
        return f"{configured}{prefix}"
    return f"{str(request.base_url).rstrip('/')}{prefix}"


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeveloperSettingsService:
    return DeveloperSettingsService(uow.session)


@router.get("/{restaurant_id}/developer", response_model=DeveloperSettingsDTO)
def get_developer_settings(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
) -> DeveloperSettingsDTO:
    return service.get_settings(restaurant.id)


@router.put("/{restaurant_id}/developer/webhook", response_model=DeveloperWebhookDTO)
def update_developer_webhook(
    data: DeveloperWebhookUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> DeveloperWebhookDTO:
    dto = service.update_webhook(restaurant.id, data)
    uow.commit()
    return dto


@router.post(
    "/{restaurant_id}/developer/webhook/rotate-secret",
    response_model=DeveloperWebhookSecretDTO,
)
def rotate_developer_webhook_secret(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> DeveloperWebhookSecretDTO:
    dto = service.rotate_webhook_secret(restaurant.id)
    uow.commit()
    return dto


@router.get(
    "/{restaurant_id}/developer/webhook/events",
    response_model=DeveloperSentEventsResponse,
)
def list_sent_webhook_events(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    limit: int = Query(default=20, ge=1, le=50),
) -> DeveloperSentEventsResponse:
    events = get_webhook_sink_store().list_events(sent_events_key(restaurant.id), limit=limit)
    return DeveloperSentEventsResponse(
        items=[
            DeveloperSentEventDTO(
                received_at=event.received_at,
                body=event.body,
                delivered=event.signature_valid,
            )
            for event in events
        ]
    )


@router.post(
    "/{restaurant_id}/developer/webhook/test",
    response_model=DeveloperWebhookTestResult,
)
def test_developer_webhook(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
) -> DeveloperWebhookTestResult:
    webhook = service.get_webhook_row(restaurant.id)
    if webhook is None or not webhook.is_enabled:
        return DeveloperWebhookTestResult(ok=False, error="Activa el webhook antes de probar")
    ok, status_code, error = deliver_test_webhook(restaurant.id)
    return DeveloperWebhookTestResult(ok=ok, status_code=status_code, error=error)


@router.post(
    "/{restaurant_id}/developer/api-keys",
    response_model=DeveloperApiKeyCreatedDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_developer_api_key(
    data: DeveloperApiKeyCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> DeveloperApiKeyCreatedDTO:
    dto = service.create_api_key(restaurant.id, data.label)
    uow.commit()
    return dto


@router.delete(
    "/{restaurant_id}/developer/api-keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_developer_api_key(
    key_id: UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: DeveloperSettingsService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.revoke_api_key(restaurant.id, key_id)
    uow.commit()
