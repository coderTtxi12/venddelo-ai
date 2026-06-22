from __future__ import annotations

import base64
import json
import re
import uuid

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.storage import StoragePort
from app.modules.delivery_providers.availability import resolve_service_status
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryProviderDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
    DeliveryProviderProfileUpdate,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderServiceStatusUpdate,
)


class DeliveryProviderService:
    def __init__(self, repo: DeliveryProviderRepository, storage: StoragePort) -> None:
        self._repo = repo
        self._storage = storage

    def get_me(self, user_id: uuid.UUID) -> DeliveryProviderMeResponse:
        found = self._repo.get_for_user(user_id)
        if found is None:
            return DeliveryProviderMeResponse(provider=None, member_role=None, primary_zone=None)
        provider, member_role = found
        primary_zone = self._repo.get_primary_zone(provider.id)
        return DeliveryProviderMeResponse(
            provider=provider,
            member_role=member_role,
            primary_zone=primary_zone,
        )

    def update_profile(
        self, user_id: uuid.UUID, data: DeliveryProviderProfileUpdate
    ) -> DeliveryProviderDTO:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

        provider, _member_role = found
        polygon = data.service_zone_polygon
        if polygon.type != "Polygon":
            raise ValidationError("El cerco debe ser un polígono")
        ring = polygon.coordinates[0] if polygon.coordinates else []
        if len(ring) < 4:
            raise ValidationError("Dibuja un cerco con al menos 3 puntos")

        logo_path = self._upload_logo_if_present(data.logo_base64, data.logo_file_name)
        geojson = json.dumps(
            {
                "type": "Polygon",
                "coordinates": polygon.coordinates,
            }
        )

        return self._repo.update_profile(
            provider.id,
            company_name=data.company_name.strip(),
            responsible_name=data.responsible_name.strip(),
            responsible_phone=data.responsible_phone.strip(),
            whatsapp_phone=data.whatsapp_phone.strip(),
            logo_path=logo_path,
            zone_name=data.service_zone_name.strip() or "Cobertura principal",
            zone_geojson=geojson,
            center_lat=data.center_lat,
            center_lng=data.center_lng,
        )

    def submit_onboarding(
        self, user_id: uuid.UUID, data: DeliveryProviderOnboardingSubmit
    ) -> DeliveryProviderDTO:
        if self._repo.get_for_user(user_id) is not None:
            raise ConflictError("Ya tienes un proveedor de delivery registrado")

        polygon = data.service_zone_polygon
        if polygon.type != "Polygon":
            raise ValidationError("El cerco debe ser un polígono")
        ring = polygon.coordinates[0] if polygon.coordinates else []
        if len(ring) < 4:
            raise ValidationError("Dibuja un cerco con al menos 3 puntos")

        slug = self._generate_unique_slug(data.company_name)
        logo_path = self._upload_logo_if_present(data.logo_base64, data.logo_file_name)

        geojson = json.dumps(
            {
                "type": "Polygon",
                "coordinates": polygon.coordinates,
            }
        )

        provider = self._repo.create_onboarding(
            user_id=user_id,
            company_name=data.company_name.strip(),
            slug=slug,
            responsible_name=data.responsible_name.strip(),
            responsible_phone=data.responsible_phone.strip(),
            whatsapp_phone=data.whatsapp_phone.strip(),
            logo_path=logo_path,
            zone_name=data.service_zone_name.strip() or "Cobertura principal",
            zone_geojson=geojson,
        )
        return provider

    def _generate_unique_slug(self, company_name: str) -> str:
        base = re.sub(r"[^a-z0-9]+", "-", company_name.lower().strip())
        base = re.sub(r"-+", "-", base).strip("-") or "delivery"
        base = base[:48]
        for attempt in range(8):
            suffix = "" if attempt == 0 else f"-{uuid.uuid4().hex[:5]}"
            slug = f"{base}{suffix}"[:63]
            if not self._repo.slug_exists(slug):
                return slug
        return f"{base}-{uuid.uuid4().hex[:8]}"[:63]

    def _upload_logo_if_present(self, logo_base64: str | None, file_name: str | None) -> str | None:
        if not logo_base64:
            return None

        match = re.match(r"^data:(image/[^;]+);base64,(.+)$", logo_base64.strip(), re.DOTALL)
        if not match:
            raise ValidationError("Formato de logo inválido")

        content_type = match.group(1)
        if not content_type.startswith("image/"):
            raise ValidationError("El logo debe ser una imagen")

        raw = base64.b64decode(match.group(2), validate=True)
        if len(raw) > 2 * 1024 * 1024:
            raise ValidationError("El logo no puede superar 2 MB")

        ext = "webp" if content_type == "image/webp" else content_type.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"
        safe_name = (file_name or f"logo.{ext}").rsplit(".", 1)[0]
        path = f"delivery-providers/onboarding/{uuid.uuid4()}/{safe_name}.webp"
        stored = self._storage.upload(path, raw, "image/webp" if ext == "webp" else content_type)
        return stored.path

    def list_schedules(self, user_id: uuid.UUID) -> list[DeliveryProviderScheduleDTO]:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

        provider, _member_role = found
        rows = list(self._repo.list_schedules(provider.id))
        if not rows:
            self._repo.seed_default_schedules(provider.id)
            rows = list(self._repo.list_schedules(provider.id))
        return rows

    def set_schedules(
        self, user_id: uuid.UUID, schedules: list[DeliveryProviderScheduleCreate]
    ) -> None:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

        provider, _member_role = found
        self._validate_schedules(schedules)
        self._repo.set_schedules(provider.id, schedules)

    def _validate_schedules(self, schedules: list[DeliveryProviderScheduleCreate]) -> None:
        for entry in schedules:
            if entry.opens_at >= entry.closes_at:
                raise ValidationError(
                    "La hora de cierre debe ser posterior a la de apertura en cada turno"
                )

    def get_service_status(self, user_id: uuid.UUID) -> DeliveryProviderServiceStatusDTO:
        provider, schedules = self._provider_schedules_for_user(user_id)
        return self._build_service_status(provider.id, schedules)

    def update_service_status(
        self, user_id: uuid.UUID, data: DeliveryProviderServiceStatusUpdate
    ) -> DeliveryProviderServiceStatusDTO:
        provider, schedules = self._provider_schedules_for_user(user_id)
        self._repo.set_service_manually_enabled(provider.id, data.manually_enabled)
        return self._build_service_status(provider.id, schedules)

    def _provider_schedules_for_user(
        self, user_id: uuid.UUID
    ) -> tuple[DeliveryProviderDTO, list[DeliveryProviderScheduleDTO]]:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

        provider, _member_role = found
        schedules = list(self._repo.list_schedules(provider.id))
        if not schedules:
            self._repo.seed_default_schedules(provider.id)
            schedules = list(self._repo.list_schedules(provider.id))
        return provider, schedules

    def _build_service_status(
        self,
        provider_id: uuid.UUID,
        schedules: list[DeliveryProviderScheduleDTO],
    ) -> DeliveryProviderServiceStatusDTO:
        manually_enabled = self._repo.get_service_manually_enabled(provider_id)
        timezone = self._repo.get_provider_timezone(provider_id)
        resolved = resolve_service_status(
            manually_enabled=manually_enabled,
            schedules=schedules,
            timezone=timezone,
        )
        return DeliveryProviderServiceStatusDTO(
            manually_enabled=resolved.manually_enabled,
            within_schedule=resolved.within_schedule,
            service_active=resolved.service_active,
            status_reason=resolved.status_reason,
            next_change_at=resolved.next_change_at,
            timezone=resolved.timezone,
        )
