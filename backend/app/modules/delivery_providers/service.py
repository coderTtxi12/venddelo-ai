from __future__ import annotations

import base64
import json
import re
import uuid

from app.core.exceptions import ConflictError, ValidationError
from app.core.storage import StoragePort
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryProviderDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
)


class DeliveryProviderService:
    def __init__(self, repo: DeliveryProviderRepository, storage: StoragePort) -> None:
        self._repo = repo
        self._storage = storage

    def get_me(self, user_id: uuid.UUID) -> DeliveryProviderMeResponse:
        found = self._repo.get_for_user(user_id)
        if found is None:
            return DeliveryProviderMeResponse(provider=None, member_role=None)
        provider, member_role = found
        return DeliveryProviderMeResponse(provider=provider, member_role=member_role)

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
