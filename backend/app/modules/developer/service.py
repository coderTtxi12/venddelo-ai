from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.developer import RestaurantDeveloperApiKey, RestaurantTrackingWebhook
from app.modules.developer.crypto import generate_api_key, generate_webhook_signing_secret
from app.modules.developer.schemas import (
    DeveloperApiKeyCreatedDTO,
    DeveloperApiKeyDTO,
    DeveloperSettingsDTO,
    DeveloperWebhookDTO,
    DeveloperWebhookSecretDTO,
    DeveloperWebhookTestSinkDTO,
    DeveloperWebhookUpdate,
)


def _generate_sink_token() -> str:
    return secrets.token_urlsafe(32).replace("-", "").replace("_", "")[:48]


def _validate_webhook_url(url: str | None) -> None:
    if url is None or not url.strip():
        return
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("https", "http"):
        raise ValidationError("La URL del webhook debe usar http o https")
    if not parsed.netloc:
        raise ValidationError("URL del webhook inválida")


class DeveloperSettingsService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_settings(self, restaurant_id: uuid.UUID, *, api_v1_root: str) -> DeveloperSettingsDTO:
        webhook = self._ensure_sink_token(self._get_or_create_webhook(restaurant_id))
        keys = self._session.scalars(
            select(RestaurantDeveloperApiKey)
            .where(
                RestaurantDeveloperApiKey.restaurant_id == restaurant_id,
                RestaurantDeveloperApiKey.revoked_at.is_(None),
            )
            .order_by(RestaurantDeveloperApiKey.created_at.desc())
        ).all()
        root = api_v1_root.rstrip("/")
        test_sink = DeveloperWebhookTestSinkDTO(
            post_url=f"{root}/public/webhook-sink/{webhook.sink_token}",
            events_url=f"{root}/public/webhook-sink/{webhook.sink_token}/events",
        )
        return DeveloperSettingsDTO(
            webhook=self._webhook_dto(webhook),
            api_keys=[self._key_dto(row) for row in keys],
            test_sink=test_sink,
        )

    def update_webhook(
        self,
        restaurant_id: uuid.UUID,
        data: DeveloperWebhookUpdate,
    ) -> DeveloperWebhookDTO:
        webhook = self._get_or_create_webhook(restaurant_id)
        if data.url is not None:
            _validate_webhook_url(data.url)
            webhook.url = data.url.strip() or None
        if data.is_enabled is not None:
            webhook.is_enabled = data.is_enabled
        if data.notify_status is not None:
            webhook.notify_status = data.notify_status
        if data.notify_location is not None:
            webhook.notify_location = data.notify_location
        if webhook.is_enabled:
            if not webhook.url:
                raise ValidationError("Configura una URL antes de activar el webhook")
            if not webhook.signing_secret:
                raise ValidationError("Genera un secreto de firma antes de activar el webhook")
        self._session.flush()
        return self._webhook_dto(webhook)

    def rotate_webhook_secret(self, restaurant_id: uuid.UUID) -> DeveloperWebhookSecretDTO:
        webhook = self._get_or_create_webhook(restaurant_id)
        secret, hint = generate_webhook_signing_secret()
        webhook.signing_secret = secret
        webhook.secret_hint = hint
        self._session.flush()
        return DeveloperWebhookSecretDTO(signing_secret=secret, secret_hint=hint)

    def create_api_key(
        self,
        restaurant_id: uuid.UUID,
        label: str,
    ) -> DeveloperApiKeyCreatedDTO:
        full, prefix, key_hash = generate_api_key()
        row = RestaurantDeveloperApiKey(
            restaurant_id=restaurant_id,
            label=label.strip(),
            key_prefix=prefix,
            key_hash=key_hash,
        )
        self._session.add(row)
        self._session.flush()
        dto = self._key_dto(row)
        return DeveloperApiKeyCreatedDTO(**dto.model_dump(), api_key=full)

    def revoke_api_key(self, restaurant_id: uuid.UUID, key_id: uuid.UUID) -> None:
        row = self._session.get(RestaurantDeveloperApiKey, key_id)
        if row is None or row.restaurant_id != restaurant_id:
            raise NotFoundError("API key no encontrada")
        if row.revoked_at is None:
            row.revoked_at = datetime.now(UTC)
            self._session.flush()

    def get_webhook_row(self, restaurant_id: uuid.UUID) -> RestaurantTrackingWebhook | None:
        return self._session.get(RestaurantTrackingWebhook, restaurant_id)

    def _get_or_create_webhook(self, restaurant_id: uuid.UUID) -> RestaurantTrackingWebhook:
        row = self._session.get(RestaurantTrackingWebhook, restaurant_id)
        if row is not None:
            return row
        row = RestaurantTrackingWebhook(
            restaurant_id=restaurant_id,
            sink_token=_generate_sink_token(),
        )
        self._session.add(row)
        self._session.flush()
        return row

    def _ensure_sink_token(self, row: RestaurantTrackingWebhook) -> RestaurantTrackingWebhook:
        if getattr(row, "sink_token", None):
            return row
        row.sink_token = _generate_sink_token()
        self._session.flush()
        return row

    def get_webhook_by_sink_token(self, sink_token: str) -> RestaurantTrackingWebhook | None:
        return self._session.scalar(
            select(RestaurantTrackingWebhook).where(RestaurantTrackingWebhook.sink_token == sink_token)
        )

    @staticmethod
    def _webhook_dto(row: RestaurantTrackingWebhook) -> DeveloperWebhookDTO:
        return DeveloperWebhookDTO(
            url=row.url,
            is_enabled=row.is_enabled,
            notify_status=row.notify_status,
            notify_location=row.notify_location,
            secret_hint=row.secret_hint,
            has_signing_secret=bool(row.signing_secret),
        )

    @staticmethod
    def _key_dto(row: RestaurantDeveloperApiKey) -> DeveloperApiKeyDTO:
        return DeveloperApiKeyDTO(
            id=row.id,
            label=row.label,
            key_prefix=row.key_prefix,
            created_at=row.created_at,
            revoked_at=row.revoked_at,
        )
