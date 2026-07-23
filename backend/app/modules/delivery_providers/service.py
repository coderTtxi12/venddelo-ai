from __future__ import annotations

import base64
import json
import re
import uuid

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.storage import StoragePort
from app.modules.delivery_providers.availability import resolve_service_status
from app.modules.delivery_providers.pricing import (
    config_from_json,
    quote_delivery_fee,
    validate_pricing_config,
)
from app.modules.delivery_providers.permissions import (
    require_manage_weather,
    require_write_provider_config,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryProviderAdminInviteCreate,
    DeliveryProviderAdminInviteDTO,
    DeliveryProviderDTO,
    DeliveryProviderMemberDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
    DeliveryProviderPaymentMethodCreate,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderPricingConfigDTO,
    DeliveryProviderPricingResponse,
    DeliveryProviderPricingUpdate,
    DeliveryProviderProfileUpdate,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderServiceStatusUpdate,
    DeliveryProviderWeatherModeUpdate,
    DeliveryPricingQuoteDTO,
    DeliveryPricingSimulateRequest,
    DeliveryWeatherMode,
)

PAYMENT_METHOD_KEYS: frozenset[str] = frozenset({"cash", "transfer", "card_terminal"})
_ADMIN_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DeliveryProviderService:
    def __init__(self, repo: DeliveryProviderRepository, storage: StoragePort) -> None:
        self._repo = repo
        self._storage = storage

    def get_me(self, user_id: uuid.UUID, email: str | None = None) -> DeliveryProviderMeResponse:
        found = self._repo.get_for_user(user_id)
        if found is None and email:
            self._repo.claim_admin_invites(user_id, email)
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

    def list_admin_invites(self, user_id: uuid.UUID) -> list[DeliveryProviderAdminInviteDTO]:
        provider_id = self._require_owner_provider_id(user_id)
        return list(self._repo.list_admin_invites(provider_id))

    def list_admin_members(self, user_id: uuid.UUID) -> list[DeliveryProviderMemberDTO]:
        provider_id = self._require_owner_provider_id(user_id)
        return list(self._repo.list_admin_members(provider_id))

    def add_admin_invite(
        self, user_id: uuid.UUID, data: DeliveryProviderAdminInviteCreate
    ) -> DeliveryProviderAdminInviteDTO:
        provider_id = self._require_owner_provider_id(user_id)
        normalized = self._normalize_admin_email(data.email)
        if any(
            member.email and member.email.strip().lower() == normalized
            for member in self._repo.list_admin_members(provider_id)
        ):
            raise ConflictError("Ese correo ya pertenece al equipo")
        existing = [row for row in self._repo.list_admin_invites(provider_id) if row.email == normalized]
        if existing:
            raise ConflictError("Ese correo ya tiene una invitación pendiente")
        return self._repo.add_admin_invite(provider_id, normalized, data.member_role)

    def remove_admin_invite(self, user_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        provider_id = self._require_owner_provider_id(user_id)
        self._repo.remove_admin_invite(provider_id, invite_id)

    def update_profile(
        self, user_id: uuid.UUID, data: DeliveryProviderProfileUpdate
    ) -> DeliveryProviderDTO:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")

        provider, member_role = found
        require_write_provider_config(member_role)
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

        provider, member_role = found
        require_write_provider_config(member_role)
        self._validate_schedules(schedules)
        self._repo.set_schedules(provider.id, schedules)

    def list_payment_methods(self, user_id: uuid.UUID) -> list[DeliveryProviderPaymentMethodDTO]:
        provider = self._require_provider(user_id)
        rows = list(self._repo.list_payment_methods(provider.id))
        if not rows:
            self._repo.seed_default_payment_methods(provider.id)
            rows = list(self._repo.list_payment_methods(provider.id))
        return rows

    def set_payment_methods(
        self,
        user_id: uuid.UUID,
        methods: list[DeliveryProviderPaymentMethodCreate],
    ) -> list[DeliveryProviderPaymentMethodDTO]:
        provider = self._require_provider(user_id)
        self._validate_payment_methods(methods)
        self._repo.set_payment_methods(provider.id, methods)
        return list(self._repo.list_payment_methods(provider.id))

    def _validate_payment_methods(self, methods: list[DeliveryProviderPaymentMethodCreate]) -> None:
        if len(methods) != len(PAYMENT_METHOD_KEYS):
            raise ValidationError("Debes enviar los tres métodos de pago")

        seen: set[str] = set()
        for entry in methods:
            if entry.method in seen:
                raise ValidationError(f"Método de pago duplicado: {entry.method}")
            seen.add(entry.method)

        if seen != PAYMENT_METHOD_KEYS:
            raise ValidationError("Los métodos de pago deben ser efectivo, transferencia y terminal")

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

    def get_pricing(self, user_id: uuid.UUID) -> DeliveryProviderPricingResponse:
        provider = self._require_provider(user_id)
        config = self._load_pricing_config(provider.id)
        weather_mode = self._repo.get_weather_mode(provider.id)
        return DeliveryProviderPricingResponse(
            weather_mode=weather_mode,  # type: ignore[arg-type]
            config=config,
        )

    def update_pricing(
        self, user_id: uuid.UUID, data: DeliveryProviderPricingUpdate
    ) -> DeliveryProviderPricingResponse:
        provider = self._require_provider(user_id)
        parsed = config_from_json(
            {
                "inside_polygon": data.config.inside_polygon.model_dump(),
                "outside_polygon": data.config.outside_polygon.model_dump(),
            }
        )
        try:
            validate_pricing_config(parsed)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        saved = self._repo.set_pricing_config(provider.id, data.config)
        weather_mode = self._repo.get_weather_mode(provider.id)
        return DeliveryProviderPricingResponse(
            weather_mode=weather_mode,  # type: ignore[arg-type]
            config=saved,
        )

    def update_weather_mode(
        self, user_id: uuid.UUID, data: DeliveryProviderWeatherModeUpdate
    ) -> DeliveryProviderPricingResponse:
        provider = self._require_provider(user_id)
        self._repo.set_weather_mode(provider.id, data.weather_mode)
        return self.get_pricing(user_id)

    def simulate_pricing(
        self, user_id: uuid.UUID, data: DeliveryPricingSimulateRequest
    ) -> DeliveryPricingQuoteDTO:
        provider = self._require_provider(user_id)
        config_dto = self._load_pricing_config(provider.id)
        parsed = config_from_json(
            {
                "inside_polygon": config_dto.inside_polygon.model_dump(),
                "outside_polygon": config_dto.outside_polygon.model_dump(),
            }
        )
        weather_mode: DeliveryWeatherMode = (
            data.weather_mode
            if data.weather_mode is not None
            else self._repo.get_weather_mode(provider.id)  # type: ignore[assignment]
        )
        quote = quote_delivery_fee(
            parsed,
            inside_polygon=data.inside_polygon,
            distance_km=data.distance_km,
            is_night=data.is_night if data.inside_polygon else False,
            weather_mode=weather_mode,
        )
        return DeliveryPricingQuoteDTO(
            available=quote.available,
            reason=quote.reason,
            total_cents=quote.total_cents,
            repa_cents=quote.repa_cents,
            mexy_cents=quote.mexy_cents,
            restaurant_cents=quote.restaurant_cents,
            inside_polygon=quote.inside_polygon,
            distance_km=quote.distance_km,
            weather_mode=quote.weather_mode,
            is_night=quote.is_night,
        )

    def _require_provider(self, user_id: uuid.UUID) -> DeliveryProviderDTO:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        provider, _member_role = found
        return provider

    def _require_owner_provider_id(self, user_id: uuid.UUID) -> uuid.UUID:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        provider, member_role = found
        if member_role != "owner":
            raise ForbiddenError("Solo el propietario puede administrar invitaciones")
        return provider.id

    def _normalize_admin_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if not _ADMIN_EMAIL_RE.match(normalized):
            raise ValidationError("Correo electrónico inválido")
        return normalized

    def _load_pricing_config(self, provider_id: uuid.UUID) -> DeliveryProviderPricingConfigDTO:
        config = self._repo.get_pricing_config(provider_id)
        if config is None:
            self._repo.seed_default_pricing_config(provider_id)
            config = self._repo.get_pricing_config(provider_id)
        if config is None:
            raise NotFoundError("No se encontró configuración de tarifas")
        return config
