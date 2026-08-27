from __future__ import annotations

import base64
import binascii
import http.client
import re
import secrets
import ssl
import uuid
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urljoin, urlparse

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.storage import StoragePort
from app.db.models.delivery import (
    DeliveryCreditHold,
    DeliveryDispatchOffer,
    DeliveryDispatchRequest,
    DeliveryDriver,
    DeliveryProvider,
    DeliveryProviderAssignmentSettings,
    DeliveryProviderMember,
    DeliveryProviderZone,
    DeliverySearchLeadTime,
    RestaurantDeliveryProvider,
)
from app.db.models.restaurant import Restaurant
from app.infra.storage.factory import build_storage
from app.modules.assistant.image_webp import WEBP_CONTENT_TYPE, convert_image_bytes_to_webp
from app.modules.delivery_dispatch.app_client import (
    force_update_payload,
    must_update_app,
    provider_rider_apk_url,
)
from app.modules.delivery_dispatch.assignment_log import list_assignment_events
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.history import list_active_holds, list_dispatch_history
from app.modules.delivery_dispatch.itinerary import (
    ItineraryStop,
    complete_stop,
    hydrate_itinerary,
    load_plan,
    parse_manual_stops,
    pickup_before_dropoff,
    rebuild_driver_itinerary,
    remove_request_stops,
    replace_plan,
)
from app.modules.delivery_dispatch.maps_url import (
    extract_maps_query_text,
    geocode_address_text,
    parse_maps_url,
    should_follow_maps_redirect,
)
from app.modules.delivery_dispatch.monitor import build_dispatch_monitor_snapshot
from app.modules.delivery_dispatch.monitor_notify import (
    notify_dispatch_monitor_changed,
    notify_driver_location_realtime,
    notify_request_realtime,
    notify_rider_updated,
)
from app.modules.delivery_dispatch.rider_route import group_offer_totals, order_offer_stops
from app.modules.delivery_dispatch.schemas import (
    AssignmentLogDTO,
    AssignmentLogEventDTO,
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    DeliveryDriverCreate,
    DeliveryDriverDocumentsUpdate,
    DeliveryDriverDTO,
    DeliveryDriverUpdate,
    DispatchMonitorSnapshotDTO,
    DispatchPaymentUpdate,
    DispatchRequestCreate,
    DispatchRequestDTO,
    DispatchRetryDTO,
    DriverItineraryStopDTO,
    ItineraryUpdate,
    ManualOfferCreate,
    ManualOfferDTO,
    ProviderHistoryPageDTO,
    PublicDispatchTrackingDTO,
    RiderAssignmentDTO,
    RiderHistoryPageDTO,
    RiderOfferDTO,
    RiderOfferStopDTO,
    RiderProfileDTO,
    SearchLeadTimeDTO,
    SearchLeadTimeUpdate,
)
from app.modules.delivery_dispatch.search_at import compute_search_at
from app.modules.delivery_dispatch.short_id import allocate_dispatch_short_id
from app.modules.delivery_dispatch.tasks import (
    close_offered_offers,
    enqueue,
    expire_stale_open_offers,
    lock_request_and_group,
    persist_dispatch_offer,
    reject_offer_and_search,
    release_group_on_cancel,
    restart_unassigned_search,
)
from app.modules.delivery_dispatch.tracking_view import (
    build_public_tracking_dto,
    build_tracking_rider_dto,
)
from app.modules.delivery_providers.permissions import (
    require_manage_partnerships,
    require_view_drivers,
    require_write_provider_config,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.public.delivery_quote_service import PublicDeliveryQuoteService
from app.modules.restaurants.schemas import RestaurantDTO
from app.modules.users.schemas import UserDTO

_ALLOWED_DOCUMENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "application/pdf"})
_MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def claim_drivers(session: Session, user_id: uuid.UUID, email: str) -> None:
    normalized = email.strip().lower()
    if not normalized:
        return

    drivers = session.scalars(
        select(DeliveryDriver).where(
            func.lower(func.btrim(DeliveryDriver.email)) == normalized,
            DeliveryDriver.user_id.is_(None),
        )
    ).all()
    if not drivers:
        return

    for driver in drivers:
        if driver.status == "blocked":
            continue
        driver.user_id = user_id
        driver.status = "active"
        existing = session.scalar(
            select(DeliveryProviderMember.id).where(
                DeliveryProviderMember.delivery_provider_id == driver.delivery_provider_id,
                DeliveryProviderMember.user_id == user_id,
            )
        )
        if existing is None:
            session.add(
                DeliveryProviderMember(
                    delivery_provider_id=driver.delivery_provider_id,
                    user_id=user_id,
                    member_role="driver",
                    is_active=True,
                )
            )

    session.flush()


class DeliveryDispatchService:
    def __init__(
        self,
        session: Session,
        provider_repo: DeliveryProviderRepository,
        storage: StoragePort,
    ) -> None:
        self._session = session
        self._provider_repo = provider_repo
        self._storage = storage

    def list_drivers(self, user_id: uuid.UUID) -> list[DeliveryDriverDTO]:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_view_drivers(member_role)
        rows = self._session.scalars(
            select(DeliveryDriver)
            .options(selectinload(DeliveryDriver.registered_zone))
            .where(DeliveryDriver.delivery_provider_id == provider_id)
            .order_by(DeliveryDriver.created_at.desc())
        ).all()
        return [self._to_driver_dto(row) for row in rows]

    def get_driver(self, user_id: uuid.UUID, driver_id: uuid.UUID) -> DeliveryDriverDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_view_drivers(member_role)
        row = self._get_driver_or_raise(provider_id, driver_id)
        return self._to_driver_dto(row)

    def create_driver(self, user_id: uuid.UUID, data: DeliveryDriverCreate) -> DeliveryDriverDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_write_provider_config(member_role)

        email = data.email.strip().lower()
        if not email:
            raise ValidationError("Correo electrónico inválido")

        existing = self._session.scalar(
            select(DeliveryDriver.id).where(
                DeliveryDriver.delivery_provider_id == provider_id,
                func.lower(func.btrim(DeliveryDriver.email)) == email,
            )
        )
        if existing is not None:
            raise ConflictError("Ya existe un repartidor con ese correo")

        compartment = data.compartment_size.strip().lower()
        if compartment not in {"normal", "grande"}:
            raise ValidationError("Compartimento inválido")

        profile_photo_path = self._upload_document(
            provider_id,
            data.profile_photo_base64,
            data.profile_photo_file_name,
            "profile-photo",
        )
        ine_document_path = self._upload_document(
            provider_id,
            data.ine_document_base64,
            data.ine_document_file_name,
            "ine",
        )
        license_document_path = self._upload_document(
            provider_id,
            data.license_document_base64,
            data.license_document_file_name,
            "license",
        )
        insurance_document_path = self._upload_document(
            provider_id,
            data.insurance_document_base64,
            data.insurance_document_file_name,
            "insurance",
        )

        row = DeliveryDriver(
            delivery_provider_id=provider_id,
            user_id=None,
            email=email,
            first_name=data.first_name.strip(),
            last_name=data.last_name.strip(),
            phone=data.phone.strip(),
            emergency_contact_name=data.emergency_contact_name.strip(),
            emergency_contact_phone=data.emergency_contact_phone.strip(),
            profile_photo_path=profile_photo_path,
            ine_document_path=ine_document_path,
            license_document_path=license_document_path,
            insurance_document_path=insurance_document_path,
            credit_limit_cents=data.credit_limit_cents,
            credit_held_cents=0,
            compartment_size=compartment,
            plate=data.plate.strip().upper(),
            motorcycle_brand=data.motorcycle_brand.strip(),
            motorcycle_color=data.motorcycle_color.strip(),
            registered_zone_id=self._resolve_registered_zone(provider_id, data.registered_zone_id),
            status="invited",
            is_online=False,
        )
        self._session.add(row)
        self._session.flush()
        self._session.refresh(row)
        return self._to_driver_dto(row)

    def update_driver(
        self,
        user_id: uuid.UUID,
        driver_id: uuid.UUID,
        data: DeliveryDriverUpdate,
    ) -> DeliveryDriverDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_write_provider_config(member_role)
        row = self._get_driver_or_raise(provider_id, driver_id)

        updates = data.model_dump(exclude_unset=True)
        if "email" in updates and updates["email"] is not None:
            normalized = updates["email"].strip().lower()
            if not normalized:
                raise ValidationError("Correo electrónico inválido")
            duplicate = self._session.scalar(
                select(DeliveryDriver.id).where(
                    DeliveryDriver.delivery_provider_id == provider_id,
                    func.lower(func.btrim(DeliveryDriver.email)) == normalized,
                    DeliveryDriver.id != driver_id,
                )
            )
            if duplicate is not None:
                raise ConflictError("Ya existe un repartidor con ese correo")
            updates["email"] = normalized

        if "compartment_size" in updates and updates["compartment_size"] is not None:
            compartment = updates["compartment_size"].strip().lower()
            if compartment not in {"normal", "grande"}:
                raise ValidationError("Compartimento inválido")
            updates["compartment_size"] = compartment

        if "status" in updates and updates["status"] is not None:
            status = updates["status"].strip().lower()
            if status not in {"invited", "active", "blocked"}:
                raise ValidationError("Estado inválido")
            updates["status"] = status
            if status == "blocked":
                row.is_online = False

        if "credit_limit_cents" in updates and updates["credit_limit_cents"] is not None:
            if updates["credit_limit_cents"] < row.credit_held_cents:
                raise ValidationError(
                    "El límite de crédito no puede ser menor que el crédito retenido"
                )

        if "registered_zone_id" in updates:
            updates["registered_zone_id"] = self._resolve_registered_zone(
                provider_id, updates["registered_zone_id"]
            )

        text_fields = (
            "first_name",
            "last_name",
            "phone",
            "emergency_contact_name",
            "emergency_contact_phone",
            "plate",
            "motorcycle_brand",
            "motorcycle_color",
        )
        for field in text_fields:
            if field in updates and updates[field] is not None:
                value = updates[field].strip()
                if field == "plate":
                    value = value.upper()
                updates[field] = value

        for field, value in updates.items():
            setattr(row, field, value)

        self._session.flush()
        self._session.refresh(row)
        return self._to_driver_dto(row)

    def upload_driver_documents(
        self,
        user_id: uuid.UUID,
        driver_id: uuid.UUID,
        data: DeliveryDriverDocumentsUpdate,
    ) -> DeliveryDriverDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_write_provider_config(member_role)
        row = self._get_driver_or_raise(provider_id, driver_id)

        if data.profile_photo_base64:
            row.profile_photo_path = self._upload_document(
                provider_id,
                data.profile_photo_base64,
                data.profile_photo_file_name,
                "profile-photo",
            )
        if data.ine_document_base64:
            row.ine_document_path = self._upload_document(
                provider_id,
                data.ine_document_base64,
                data.ine_document_file_name,
                "ine",
            )
        if data.license_document_base64:
            row.license_document_path = self._upload_document(
                provider_id,
                data.license_document_base64,
                data.license_document_file_name,
                "license",
            )
        if data.insurance_document_base64:
            row.insurance_document_path = self._upload_document(
                provider_id,
                data.insurance_document_base64,
                data.insurance_document_file_name,
                "insurance",
            )

        self._session.flush()
        self._session.refresh(row)
        return self._to_driver_dto(row)

    def get_assignment_settings(self, user_id: uuid.UUID) -> AssignmentSettingsDTO:
        provider_id = self._require_provider_id(user_id)
        row = self._get_or_raise_settings(provider_id)
        return AssignmentSettingsDTO.model_validate(row)

    def update_assignment_settings(
        self,
        user_id: uuid.UUID,
        data: AssignmentSettingsUpdate,
    ) -> AssignmentSettingsDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_write_provider_config(member_role)
        row = self._get_or_raise_settings(provider_id)
        payload = data.model_dump(exclude_unset=True)
        for field, value in payload.items():
            setattr(row, field, value)
        speed = row.pre_free_speed_mps or 8.0
        pairs = (
            ("max_pickup_detour_meters", "max_pickup_detour_minutes"),
            ("max_destination_detour_meters", "max_destination_detour_minutes"),
            ("max_extra_route_meters", "max_extra_route_minutes"),
        )
        for meters_field, minutes_field in pairs:
            if meters_field in payload:
                meters = getattr(row, meters_field) or 0
                setattr(
                    row,
                    minutes_field,
                    int(round(meters / (60 * speed))) if speed else 0,
                )
            elif minutes_field in payload:
                minutes = getattr(row, minutes_field) or 0
                setattr(row, meters_field, int(round(minutes * 60 * speed)))
        self._session.flush()
        self._session.refresh(row)
        return AssignmentSettingsDTO.model_validate(row)

    def list_search_lead_times(self, user_id: uuid.UUID) -> list[SearchLeadTimeDTO]:
        provider_id = self._require_provider_id(user_id)
        rows = self._session.scalars(
            select(DeliverySearchLeadTime)
            .where(DeliverySearchLeadTime.delivery_provider_id == provider_id)
            .order_by(DeliverySearchLeadTime.prep_minutes.asc())
        ).all()
        return [SearchLeadTimeDTO.model_validate(row) for row in rows]

    def update_search_lead_times(
        self,
        user_id: uuid.UUID,
        updates: list[SearchLeadTimeUpdate],
    ) -> list[SearchLeadTimeDTO]:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_write_provider_config(member_role)

        rows = self._session.scalars(
            select(DeliverySearchLeadTime).where(
                DeliverySearchLeadTime.delivery_provider_id == provider_id
            )
        ).all()
        by_prep = {row.prep_minutes: row for row in rows}

        for item in updates:
            row = by_prep.get(item.prep_minutes)
            if row is None:
                raise ValidationError("Ese tiempo de preparación no está configurado")
            row.search_ahead_minutes = item.search_ahead_minutes

        self._session.flush()
        return self.list_search_lead_times(user_id)

    def get_dispatch_monitor(
        self,
        user_id: uuid.UUID,
        zone_id: uuid.UUID | None = None,
    ) -> DispatchMonitorSnapshotDTO:
        provider_id = self._require_provider_id(user_id)
        return build_dispatch_monitor_snapshot(
            self._session,
            provider_id,
            zone_id=zone_id,
        )

    def list_history(
        self,
        user_id: uuid.UUID,
        *,
        start: date | None = None,
        end: date | None = None,
        status: str | None = None,
        driver_id: uuid.UUID | None = None,
        zone_id: uuid.UUID | None = None,
        restaurant_id: uuid.UUID | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> ProviderHistoryPageDTO:
        provider_id = self._require_provider_id(user_id)
        payload = list_dispatch_history(
            self._session,
            provider_id=provider_id,
            driver_id=driver_id,
            zone_id=zone_id,
            restaurant_id=restaurant_id,
            start=start,
            end=end,
            status=status,
            limit=limit,
            offset=offset,
            include_provider_fields=True,
        )
        return ProviderHistoryPageDTO(
            start=payload["start"],
            end=payload["end"],
            items=payload["items"],
            total=payload["total"],
            delivered_count=payload["delivered_count"],
            cancelled_count=payload["cancelled_count"],
            earnings_cents=payload["earnings_cents"],
            has_more=payload["has_more"],
        )

    def create_manual_offer(
        self,
        user_id: uuid.UUID,
        request_id: uuid.UUID,
        data: ManualOfferCreate,
    ) -> ManualOfferDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_manage_partnerships(member_role)
        now = datetime.now(UTC)
        expire_stale_open_offers(self._session, now)
        request = self._session.scalar(
            select(DeliveryDispatchRequest)
            .where(
                DeliveryDispatchRequest.id == request_id,
                DeliveryDispatchRequest.delivery_provider_id == provider_id,
            )
            .with_for_update()
        )
        if request is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        if request.status in {"delivered", "cancelled"}:
            raise ConflictError("La solicitud ya no se puede ofertar")
        if request.status not in _MANUAL_OFFERABLE_STATUSES:
            raise ConflictError("La solicitud no se puede ofertar en este estado")

        driver = self._session.scalar(
            select(DeliveryDriver)
            .where(
                DeliveryDriver.id == data.driver_id,
                DeliveryDriver.delivery_provider_id == provider_id,
            )
            .with_for_update()
        )
        if driver is None:
            raise NotFoundError("Repartidor no encontrado")
        if driver.status == "blocked":
            raise ValidationError("El repartidor está bloqueado")
        if request.assigned_driver_id == driver.id:
            raise ValidationError("Ese repartidor ya está asignado a este pedido")

        open_for_driver = self._session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.driver_id == driver.id,
                DeliveryDispatchOffer.status == "offered",
                DeliveryDispatchOffer.expires_at > now,
            )
        )
        if (
            open_for_driver is not None
            and open_for_driver.request_id == request.id
            and open_for_driver.case_applied == "M"
        ):
            return ManualOfferDTO(
                id=open_for_driver.id,
                request_id=request.id,
                driver_id=driver.id,
                case_applied=open_for_driver.case_applied,
                expires_at=open_for_driver.expires_at,
                tracking_token=request.tracking_token,
                short_id=request.short_id,
            )
        if open_for_driver is not None and open_for_driver.request_id != request.id:
            raise ConflictError("El repartidor ya tiene una oferta abierta")

        close_offered_offers(self._session, request, now)
        settings_row = self._get_or_raise_settings(provider_id)
        expires_at = now + timedelta(seconds=settings_row.offer_timeout_seconds)
        keep_status = request.status in _ACTIVE_ASSIGNMENT_STATUSES
        restore_status = request.status if request.status in {"unassigned", "searching"} else None
        if request.status in {"scheduled", "offered"}:
            restore_status = "searching"
        extra_score: dict = {"manual": True}
        if restore_status is not None and not keep_status:
            extra_score["restore_status"] = restore_status
        if data.itinerary:
            planned = [
                ItineraryStop(kind=item.kind, request_id=str(item.request_id))
                for item in data.itinerary
            ]
            if not pickup_before_dropoff(planned):
                raise ValidationError("No se puede entregar un pedido antes de recogerlo.")
            extra_score["itinerary"] = [
                {"kind": item.kind, "request_id": str(item.request_id)} for item in data.itinerary
            ]

        offer = persist_dispatch_offer(
            self._session,
            request,
            driver,
            case="M",
            high_demand=False,
            group_id=None,
            expires_at=expires_at,
            keep_request_status=keep_status,
            extra_score=extra_score,
        )
        if offer is None:
            raise ConflictError("No se pudo crear la oferta. Intenta de nuevo.")
        self._session.flush()
        notify_dispatch_monitor_changed(provider_id)
        return ManualOfferDTO(
            id=offer.id,
            request_id=request.id,
            driver_id=driver.id,
            case_applied=offer.case_applied,
            expires_at=offer.expires_at,
            tracking_token=request.tracking_token,
            short_id=request.short_id,
        )

    def retry_unassigned(
        self,
        user_id: uuid.UUID,
        request_id: uuid.UUID,
    ) -> DispatchRetryDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_manage_partnerships(member_role)
        request = self._session.scalar(
            select(DeliveryDispatchRequest)
            .where(
                DeliveryDispatchRequest.id == request_id,
                DeliveryDispatchRequest.delivery_provider_id == provider_id,
            )
            .with_for_update()
        )
        if request is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        if request.status != "unassigned":
            raise ValidationError("Solo puedes reintentar solicitudes sin asignar")
        restart_unassigned_search(self._session, request, datetime.now(UTC))
        self._session.flush()
        self._session.refresh(request)
        notify_request_realtime(self._session, request)
        notify_dispatch_monitor_changed(provider_id)
        return DispatchRetryDTO(
            id=request.id,
            status=request.status,
            search_at=request.search_at,
        )

    def get_assignment_log(self, user_id: uuid.UUID, request_id: uuid.UUID) -> AssignmentLogDTO:
        provider_id, _role = self._require_provider_with_role(user_id)
        request = self._session.scalar(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.id == request_id,
                DeliveryDispatchRequest.delivery_provider_id == provider_id,
            )
        )
        if request is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        settings = self._session.scalar(
            select(DeliveryProviderAssignmentSettings).where(
                DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
            )
        )
        timeout_at = None
        if settings is not None:
            timeout_at = request.search_at + timedelta(seconds=settings.assignment_timeout_seconds)
        rows = list_assignment_events(self._session, request.id)
        last_search_at = next(
            (row.created_at for row in reversed(rows) if row.kind in {"searched", "offered"}),
            None,
        )
        if last_search_at is None and request.status != "scheduled":
            last_search_at = request.search_at
        return AssignmentLogDTO(
            request_id=request.id,
            last_search_at=last_search_at,
            next_attempt_at=request.next_attempt_at,
            assignment_timeout_at=timeout_at,
            events=[
                AssignmentLogEventDTO(
                    id=row.id,
                    at=row.created_at,
                    kind=row.kind,
                    tone=row.tone,
                    title=row.title,
                    detail=row.detail,
                    next_attempt_at=row.next_attempt_at,
                )
                for row in rows
            ],
        )

    def update_driver_itinerary(
        self,
        user_id: uuid.UUID,
        driver_id: uuid.UUID,
        data: ItineraryUpdate,
    ) -> list[DriverItineraryStopDTO]:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_manage_partnerships(member_role)
        driver = self._session.scalar(
            select(DeliveryDriver).where(
                DeliveryDriver.id == driver_id,
                DeliveryDriver.delivery_provider_id == provider_id,
            )
        )
        if driver is None:
            raise NotFoundError("Repartidor no encontrado")
        current = set(load_plan(self._session, driver.id))
        incoming = [
            ItineraryStop(kind=item.kind, request_id=str(item.request_id)) for item in data.stops
        ]
        if set(incoming) != current:
            raise ConflictError("El itinerario cambió. Recarga el monitor.")
        if not pickup_before_dropoff(incoming):
            raise ValidationError("No se puede entregar un pedido antes de recogerlo.")
        replace_plan(self._session, driver.id, incoming)
        self._session.flush()
        notify_dispatch_monitor_changed(provider_id)
        notify_rider_updated(driver.id)
        return hydrate_itinerary(self._session, driver.id)

    def _upload_document(
        self,
        provider_id: uuid.UUID,
        data_url: str,
        file_name: str | None,
        label: str,
    ) -> str:
        match = _DATA_URL_RE.match(data_url.strip())
        if not match:
            raise ValidationError("Formato de archivo inválido")

        content_type = match.group(1).strip().lower()
        if content_type not in _ALLOWED_DOCUMENT_TYPES:
            raise ValidationError("El archivo debe ser una imagen o un PDF")

        try:
            raw = base64.b64decode(match.group(2), validate=True)
        except binascii.Error as exc:
            raise ValidationError("Formato de archivo inválido") from exc
        if len(raw) > _MAX_DOCUMENT_BYTES:
            raise ValidationError("El archivo no puede superar 8 MB")

        if content_type == "application/pdf":
            stored_type = "application/pdf"
            ext = "pdf"
        else:
            if content_type != WEBP_CONTENT_TYPE:
                try:
                    raw = convert_image_bytes_to_webp(raw)
                except ValidationError as exc:
                    raise ValidationError("No se pudo convertir la imagen a WebP") from exc
            stored_type = WEBP_CONTENT_TYPE
            ext = "webp"
            if len(raw) > _MAX_DOCUMENT_BYTES:
                raise ValidationError("El archivo no puede superar 8 MB")

        safe_name = (file_name or f"{label}.{ext}").rsplit(".", 1)[0]
        path = f"delivery-drivers/{provider_id}/{uuid.uuid4()}/{safe_name}.{ext}"
        stored = self._storage.upload(path, raw, stored_type)
        return stored.path

    def _resolve_registered_zone(
        self,
        provider_id: uuid.UUID,
        zone_id: uuid.UUID | None,
    ) -> uuid.UUID | None:
        if zone_id is None:
            return None
        found = self._session.scalar(
            select(DeliveryProviderZone.id).where(
                DeliveryProviderZone.id == zone_id,
                DeliveryProviderZone.delivery_provider_id == provider_id,
            )
        )
        if found is None:
            raise ValidationError("La zona de empresa no es válida")
        return found

    def _to_driver_dto(self, row: DeliveryDriver) -> DeliveryDriverDTO:
        zone_name = row.registered_zone.name if row.registered_zone is not None else None
        return DeliveryDriverDTO.model_validate(row).model_copy(
            update={"registered_zone_name": zone_name}
        )

    def _get_driver_or_raise(self, provider_id: uuid.UUID, driver_id: uuid.UUID) -> DeliveryDriver:
        row = self._session.scalar(
            select(DeliveryDriver).where(
                DeliveryDriver.id == driver_id,
                DeliveryDriver.delivery_provider_id == provider_id,
            )
        )
        if row is None:
            raise NotFoundError("Repartidor no encontrado")
        return row

    def _require_provider_id(self, user_id: uuid.UUID) -> uuid.UUID:
        found = self._provider_repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        provider, _role = found
        return provider.id

    def _require_provider_with_role(self, user_id: uuid.UUID) -> tuple[uuid.UUID, str]:
        found = self._provider_repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        provider, member_role = found
        return provider.id, member_role

    def _get_or_raise_settings(self, provider_id: uuid.UUID) -> DeliveryProviderAssignmentSettings:
        row = self._session.scalar(
            select(DeliveryProviderAssignmentSettings).where(
                DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
            )
        )
        if row is None:
            raise NotFoundError("Configuración de asignación no encontrada")
        return row


_PAYMENT_EDITABLE_STATUSES = frozenset({"scheduled", "searching", "offered", "unassigned"})
_CASH_CONFIRMABLE_STATUSES = frozenset({"assigned", "picked_up", "in_transit", "delivered"})
_MANUAL_OFFERABLE_STATUSES = frozenset(
    {
        "scheduled",
        "searching",
        "offered",
        "unassigned",
        "assigned",
        "picked_up",
        "in_transit",
    }
)


_MAPS_REDIRECT_HEADERS = {
    "User-Agent": "MexyDispatch/1.0",
}
_MAPS_SSL_CONTEXT = ssl.create_default_context()


_MAPS_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


def _maps_http_request(method: str, url: str) -> tuple[int, str | None]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("unsupported maps url scheme")
    host = parsed.hostname
    if not host:
        raise ValueError("maps url missing host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    if parsed.scheme == "https":
        conn: http.client.HTTPConnection = http.client.HTTPSConnection(
            host,
            port,
            timeout=10,
            context=_MAPS_SSL_CONTEXT,
        )
    else:
        conn = http.client.HTTPConnection(host, port, timeout=10)

    try:
        conn.request(method, path, headers=_MAPS_REDIRECT_HEADERS)
        response = conn.getresponse()
        location = response.getheader("Location")
        response.read()
        return response.status, location
    finally:
        conn.close()


def _follow_maps_redirects(url: str) -> str | None:
    """Expand goo.gl / maps.app.goo.gl links via redirect Location headers."""
    current = url.strip()
    if not current:
        return None

    last_maps_url = current if should_follow_maps_redirect(current) else None

    for _ in range(5):
        try:
            status, location = _maps_http_request("HEAD", current)
            if status not in _MAPS_REDIRECT_STATUSES and status != 200:
                status, location = _maps_http_request("GET", current)
            elif status in _MAPS_REDIRECT_STATUSES and not location:
                status, location = _maps_http_request("GET", current)

            if status in _MAPS_REDIRECT_STATUSES and location:
                current = urljoin(current, location)
                if should_follow_maps_redirect(current):
                    last_maps_url = current
                continue
            if status == 200:
                return current
            return last_maps_url
        except (TimeoutError, OSError, ValueError, http.client.HTTPException):
            return last_maps_url

    return current


class RestaurantDispatchService:
    def __init__(
        self,
        session: Session,
        provider_repo: DeliveryProviderRepository,
        storage: StoragePort | None = None,
    ) -> None:
        self._session = session
        self._provider_repo = provider_repo
        self._storage = storage
        self._quotes = PublicDeliveryQuoteService(provider_repo)

    def create(
        self,
        restaurant: RestaurantDTO,
        data: DispatchRequestCreate,
    ) -> DispatchRequestDTO:
        partnership = self._active_partnership(restaurant.id)
        provider_id = partnership.delivery_provider_id

        latitude, longitude = self._resolve_dropoff_coordinates(data)
        lead_time = self._resolve_lead_time(provider_id, data.prep_minutes)

        self._validate_payment(
            data.payment_method,
            data.collect_cents,
            data.cash_denomination_cents,
        )
        quote = self._quotes.quote_delivery(
            restaurant,
            delivery_latitude=latitude,
            delivery_longitude=longitude,
        )
        if not quote.available:
            raise ValidationError(quote.reason or "El servicio de reparto no está disponible.")

        now = datetime.now(UTC)
        ready_at = now + timedelta(minutes=data.prep_minutes)
        search_at = compute_search_at(
            now,
            ready_at,
            lead_time.search_ahead_minutes,
        )
        row = DeliveryDispatchRequest(
            restaurant_id=restaurant.id,
            delivery_provider_id=provider_id,
            zone_id=partnership.zone_id,
            customer_name=data.customer_name.strip(),
            customer_phone=data.customer_phone.strip(),
            dropoff_lat=latitude,
            dropoff_lng=longitude,
            dropoff_address=data.dropoff_address.strip(),
            dropoff_maps_url=data.dropoff_maps_url,
            payment_method=data.payment_method,
            collect_cents=data.collect_cents,
            cash_denomination_cents=data.cash_denomination_cents,
            package_size=data.package_size,
            package_count=data.package_count,
            ready_at=ready_at,
            search_at=search_at,
            next_attempt_at=search_at,
            quoted_fee_cents=quote.delivery_fee_cents,
            status="searching" if search_at <= now else "scheduled",
            assigned_driver_id=None,
            tracking_token=secrets.token_hex(24),
            short_id=allocate_dispatch_short_id(self._session),
            notes=data.notes.strip() if data.notes else None,
            decision_json=None,
            cancelled_at=None,
            cycle_rejected_driver_ids=[],
            cycle_silent_driver_ids=[],
        )
        self._session.add(row)
        self._session.flush()
        enqueue(
            "search",
            search_at,
            {"kind": "search", "request_id": str(row.id)},
            session=self._session,
        )
        self._session.refresh(row)
        notify_request_realtime(self._session, row)
        return self._to_dto(row)

    def list(
        self,
        restaurant: RestaurantDTO,
    ) -> list[DispatchRequestDTO]:
        self._active_partnership(restaurant.id)
        rows = self._session.scalars(
            select(DeliveryDispatchRequest)
            .options(
                selectinload(DeliveryDispatchRequest.assigned_driver),
                selectinload(DeliveryDispatchRequest.credit_hold),
            )
            .where(DeliveryDispatchRequest.restaurant_id == restaurant.id)
            .order_by(DeliveryDispatchRequest.created_at.desc())
        ).all()
        return [self._to_dto(row) for row in rows]

    def resolve_maps_url(self, url: str) -> tuple[float, float, str | None]:
        trimmed = url.strip()
        if not trimmed:
            raise ValidationError("El enlace de Google Maps es obligatorio")

        coordinates = parse_maps_url(trimmed)
        resolved_url: str | None = None
        if coordinates is None and should_follow_maps_redirect(trimmed):
            resolved_url = _follow_maps_redirects(trimmed)
            if resolved_url:
                coordinates = parse_maps_url(resolved_url)

        if coordinates is None:
            api_key = get_settings().google_maps_api_key
            candidates: list[str] = []
            for candidate_url in (resolved_url, trimmed):
                if not candidate_url:
                    continue
                query_text = extract_maps_query_text(candidate_url)
                if query_text and query_text not in candidates:
                    candidates.append(query_text)
            if api_key:
                for query_text in candidates:
                    coordinates = geocode_address_text(query_text, api_key)
                    if coordinates is not None:
                        break

        if coordinates is None:
            raise ValidationError("No se pudo leer la ubicación del enlace")
        return coordinates[0], coordinates[1], resolved_url

    def list_lead_times(
        self,
        restaurant: RestaurantDTO,
    ) -> list[SearchLeadTimeDTO]:
        partnership = self._active_partnership(restaurant.id)
        rows = self._session.scalars(
            select(DeliverySearchLeadTime)
            .where(DeliverySearchLeadTime.delivery_provider_id == partnership.delivery_provider_id)
            .order_by(DeliverySearchLeadTime.prep_minutes.asc())
        ).all()
        return [SearchLeadTimeDTO.model_validate(row) for row in rows]

    def update_payment(
        self,
        restaurant: RestaurantDTO,
        request_id: uuid.UUID,
        data: DispatchPaymentUpdate,
    ) -> DispatchRequestDTO:
        row = self._request(restaurant.id, request_id)
        if row.assigned_driver_id is not None:
            raise ConflictError("Ya hay un repartidor asignado")
        if row.status not in _PAYMENT_EDITABLE_STATUSES:
            raise ValidationError("El pago ya no se puede editar")

        updates = data.model_dump(exclude_unset=True)
        payment_method = updates.get("payment_method", row.payment_method)
        collect_cents = updates.get("collect_cents", row.collect_cents)
        cash_denomination_cents = updates.get(
            "cash_denomination_cents",
            row.cash_denomination_cents,
        )
        if payment_method != "cash" and "cash_denomination_cents" not in updates:
            cash_denomination_cents = None
        self._validate_payment(
            payment_method,
            collect_cents,
            cash_denomination_cents,
        )
        row.payment_method = payment_method
        row.collect_cents = collect_cents
        row.cash_denomination_cents = cash_denomination_cents
        return self._flush_request(row)

    def cancel(
        self,
        restaurant: RestaurantDTO,
        request_id: uuid.UUID,
    ) -> DispatchRequestDTO:
        row = self._request(restaurant.id, request_id)
        if row.status in {"delivered", "cancelled"}:
            raise ValidationError("La solicitud ya no se puede cancelar")
        if row.assigned_driver_id is not None or row.status in {
            "assigned",
            "picked_up",
            "in_transit",
        }:
            raise ValidationError("Ya hay un repartidor asignado. No se puede cancelar este envío.")
        now = datetime.now(UTC)
        close_offered_offers(self._session, row, now)
        release_group_on_cancel(self._session, row, now)
        row.status = "cancelled"
        row.cancelled_at = now
        self._release_hold(row, released_by_user_id=None, now=now)
        return self._flush_request(row)

    def retry(
        self,
        restaurant: RestaurantDTO,
        request_id: uuid.UUID,
    ) -> DispatchRequestDTO:
        row = self._request(restaurant.id, request_id)
        if row.status != "unassigned":
            raise ValidationError("Solo puedes reintentar solicitudes sin asignar")
        restart_unassigned_search(self._session, row, datetime.now(UTC))
        return self._flush_request(row)

    def confirm_rider_cash(
        self,
        restaurant: RestaurantDTO,
        request_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> DispatchRequestDTO:
        row = self._request(restaurant.id, request_id)
        if row.status not in _CASH_CONFIRMABLE_STATUSES:
            raise ValidationError("El efectivo todavía no se puede confirmar")
        hold = row.credit_hold
        if hold is None or hold.status != "held":
            raise ValidationError("No hay efectivo retenido para esta solicitud")
        self._release_hold(
            row,
            released_by_user_id=user_id,
            now=datetime.now(UTC),
        )
        return self._flush_request(row)

    def public_tracking(self, token: str) -> PublicDispatchTrackingDTO:
        row = self._session.scalar(
            select(DeliveryDispatchRequest)
            .options(selectinload(DeliveryDispatchRequest.assigned_driver))
            .where(DeliveryDispatchRequest.tracking_token == token)
        )
        if row is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        restaurant = self._session.get(Restaurant, row.restaurant_id)
        return build_public_tracking_dto(
            row,
            driver=row.assigned_driver,
            restaurant=restaurant,
            storage=self._storage or build_storage(),
        )

    def _active_partnership(
        self,
        restaurant_id: uuid.UUID,
    ) -> RestaurantDeliveryProvider:
        partnership = self._provider_repo.get_mexy_partnership_for_restaurant(restaurant_id)
        if partnership is None or partnership.status != "active":
            raise ForbiddenError("No tienes un repartidor activo")
        row = self._session.scalar(
            select(RestaurantDeliveryProvider).where(
                RestaurantDeliveryProvider.id == partnership.id
            )
        )
        if row is None:
            raise ForbiddenError("No tienes un repartidor activo")
        return row

    def _request(
        self,
        restaurant_id: uuid.UUID,
        request_id: uuid.UUID,
    ) -> DeliveryDispatchRequest:
        row = self._session.scalar(
            select(DeliveryDispatchRequest)
            .options(
                selectinload(DeliveryDispatchRequest.assigned_driver),
                selectinload(DeliveryDispatchRequest.credit_hold),
            )
            .where(
                DeliveryDispatchRequest.id == request_id,
                DeliveryDispatchRequest.restaurant_id == restaurant_id,
            )
        )
        if row is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        return row

    def _resolve_lead_time(
        self,
        provider_id: uuid.UUID,
        prep_minutes: int,
    ) -> DeliverySearchLeadTime:
        if prep_minutes >= 60:
            raise ValidationError("El tiempo debe ser menor a 60 minutos")

        exact = self._session.scalar(
            select(DeliverySearchLeadTime).where(
                DeliverySearchLeadTime.delivery_provider_id == provider_id,
                DeliverySearchLeadTime.prep_minutes == prep_minutes,
            )
        )
        if exact is not None:
            return exact

        rows = self._session.scalars(
            select(DeliverySearchLeadTime)
            .where(DeliverySearchLeadTime.delivery_provider_id == provider_id)
            .order_by(DeliverySearchLeadTime.prep_minutes.asc())
        ).all()
        if not rows:
            raise ValidationError("Ese tiempo de preparación no está configurado")
        return min(rows, key=lambda row: abs(row.prep_minutes - prep_minutes))

    def _resolve_dropoff_coordinates(
        self,
        data: DispatchRequestCreate,
    ) -> tuple[float, float]:
        if data.dropoff_lat is not None and data.dropoff_lng is not None:
            return data.dropoff_lat, data.dropoff_lng
        if not data.dropoff_maps_url:
            raise ValidationError("La ubicación de entrega es obligatoria")

        latitude, longitude, _ = self.resolve_maps_url(data.dropoff_maps_url)
        return latitude, longitude

    @staticmethod
    def _validate_payment(
        payment_method: str,
        collect_cents: int,
        cash_denomination_cents: int | None,
    ) -> None:
        if payment_method in {"cash", "card_terminal"} and collect_cents <= 0:
            raise ValidationError("El monto que recibe el restaurante debe ser mayor a cero.")
        if payment_method == "cash" and cash_denomination_cents is None:
            raise ValidationError("Indica con qué billete o moneda pagará el cliente")
        if (
            payment_method == "cash"
            and cash_denomination_cents is not None
            and cash_denomination_cents < collect_cents
        ):
            raise ValidationError("La denominación debe cubrir el monto a cobrar")

    def _flush_request(
        self,
        row: DeliveryDispatchRequest,
    ) -> DispatchRequestDTO:
        self._session.flush()
        self._session.refresh(row)
        notify_request_realtime(self._session, row)
        return self._to_dto(row)

    def _to_dto(self, row: DeliveryDispatchRequest) -> DispatchRequestDTO:
        dto = DispatchRequestDTO.model_validate(row)
        driver = row.assigned_driver
        if driver is None and row.assigned_driver_id is not None:
            driver = self._session.get(DeliveryDriver, row.assigned_driver_id)
        hold = row.credit_hold
        return dto.model_copy(
            update={
                "rider": build_tracking_rider_dto(
                    driver,
                    self._storage or build_storage(),
                ),
                "credit_hold_status": hold.status if hold is not None else None,
                "credit_hold_cents": hold.amount_cents if hold is not None else 0,
            }
        )

    def _release_hold(
        self,
        row: DeliveryDispatchRequest,
        *,
        released_by_user_id: uuid.UUID | None,
        now: datetime,
    ) -> None:
        hold: DeliveryCreditHold | None = row.credit_hold
        if hold is None or hold.status != "held":
            return
        locked_driver = None
        if row.assigned_driver_id is not None:
            locked_driver = self._session.scalar(
                select(DeliveryDriver)
                .where(DeliveryDriver.id == row.assigned_driver_id)
                .with_for_update()
            )
        hold.status = "released"
        hold.released_at = now
        hold.released_by_user_id = released_by_user_id
        if locked_driver is not None:
            locked_driver.credit_held_cents = max(
                0,
                locked_driver.credit_held_cents - hold.amount_cents,
            )


_ACTIVE_ASSIGNMENT_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
_ASSIGNMENT_STATUS_ORDER = {"in_transit": 0, "picked_up": 1, "assigned": 2}
_ASSIGNMENT_TRANSITIONS = {
    "picked_up": "assigned",
    "in_transit": "picked_up",
    "delivered": "in_transit",
}


def _apply_app_client(
    driver: DeliveryDriver,
    *,
    app_version: str | None,
    app_build_number: int | None,
) -> None:
    if app_version is not None:
        stripped = app_version.strip()
        driver.app_version = stripped or None
    if app_build_number is not None:
        driver.app_build_number = app_build_number


class RiderDispatchService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_me(
        self,
        user: UserDTO,
        *,
        app_version: str | None = None,
        app_build_number: int | None = None,
    ) -> RiderProfileDTO:
        driver = self._require_driver(user)
        changed = False
        if app_version is not None or app_build_number is not None:
            _apply_app_client(
                driver, app_version=app_version, app_build_number=app_build_number
            )
            changed = True
        if self._force_offline_if_outdated(driver):
            changed = True
        if changed:
            self._session.flush()
            self._session.refresh(driver)
        return self._to_profile(driver)

    def get_history(
        self,
        user: UserDTO,
        *,
        start: date | None = None,
        end: date | None = None,
        status: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> RiderHistoryPageDTO:
        driver = self._require_driver(user)
        payload = list_dispatch_history(
            self._session,
            driver_id=driver.id,
            start=start,
            end=end,
            status=status,
            limit=limit,
            offset=offset,
        )
        available = max(0, driver.credit_limit_cents - driver.credit_held_cents)
        return RiderHistoryPageDTO(
            start=payload["start"],
            end=payload["end"],
            items=payload["items"],
            total=payload["total"],
            delivered_count=payload["delivered_count"],
            cancelled_count=payload["cancelled_count"],
            earnings_cents=payload["earnings_cents"],
            has_more=payload["has_more"],
            credit_limit_cents=driver.credit_limit_cents,
            credit_held_cents=driver.credit_held_cents,
            credit_available_cents=available,
            active_holds=list_active_holds(self._session, driver.id),
        )

    def set_online(self, user: UserDTO, is_online: bool) -> RiderProfileDTO:
        driver = self._require_driver(user)
        driver.is_online = is_online
        self._session.flush()
        self._session.refresh(driver)
        notify_dispatch_monitor_changed(driver.delivery_provider_id)
        notify_rider_updated(driver.id)
        return self._to_profile(driver)

    def update_location(
        self,
        user: UserDTO,
        latitude: float,
        longitude: float,
    ) -> None:
        """Persist GPS only — rider app ignores the body; keep this cheap for 15s pings."""
        driver = self._require_driver(user)
        driver.last_lat = latitude
        driver.last_lng = longitude
        driver.location_updated_at = datetime.now(UTC)
        self._session.flush()
        notify_driver_location_realtime(self._session, driver)

    def set_fcm_token(self, user: UserDTO, fcm_token: str) -> RiderProfileDTO:
        driver = self._require_driver(user)
        driver.fcm_token = fcm_token
        self._session.flush()
        self._session.refresh(driver)
        return self._to_profile(driver)

    def list_offers(self, user: UserDTO) -> list[RiderOfferDTO]:
        driver = self._require_driver(user)
        now = datetime.now(UTC)
        rows = self._session.scalars(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.driver_id == driver.id,
                DeliveryDispatchOffer.status == "offered",
                DeliveryDispatchOffer.expires_at > now,
            )
            .order_by(DeliveryDispatchOffer.expires_at.asc())
        ).all()
        return [self._to_offer_dto(row) for row in rows]

    def accept_offer(self, user: UserDTO, offer_id: uuid.UUID) -> RiderOfferDTO:
        driver = self._require_driver(user)
        now = datetime.now(UTC)
        peek = self._session.get(DeliveryDispatchOffer, offer_id)
        if peek is None or peek.driver_id != driver.id:
            raise ConflictError("La oferta ya no está disponible")

        request, group_rows = lock_request_and_group(self._session, peek.request_id)
        offer = self._session.scalar(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.id == offer_id,
                DeliveryDispatchOffer.driver_id == driver.id,
            )
            .with_for_update()
        )
        if offer is None:
            raise ConflictError("La oferta ya no está disponible")
        if request is None:
            request = self._session.scalar(
                select(DeliveryDispatchRequest)
                .where(DeliveryDispatchRequest.id == offer.request_id)
                .with_for_update()
            )
            group_rows = [request] if request is not None else []
        if request is None or request.status in {"delivered", "cancelled"}:
            raise ConflictError("La oferta ya no está disponible")

        locked_driver = self._session.scalar(
            select(DeliveryDriver).where(DeliveryDriver.id == driver.id).with_for_update()
        )
        assert locked_driver is not None

        if offer.status == "accepted" and request.assigned_driver_id == locked_driver.id:
            return self._to_offer_dto(offer)
        if offer.status != "offered" or offer.expires_at <= now:
            raise ConflictError("La oferta ya no está disponible")

        if offer.case_applied == "M":
            previous_id = request.assigned_driver_id
            offer.status = "accepted"
            offer.responded_at = now
            self._swap_assigned_driver(request, locked_driver, now)
            if previous_id is not None and previous_id != locked_driver.id:
                remove_request_stops(self._session, previous_id, request.id)
            manual = None
            if isinstance(offer.score_json, dict):
                manual = parse_manual_stops(offer.score_json.get("itinerary"))
            rebuild_driver_itinerary(
                self._session,
                locked_driver.id,
                case="M",
                rider_lat=locked_driver.last_lat,
                rider_lng=locked_driver.last_lng,
                new_request_ids={str(request.id)},
                manual=manual,
            )
            self._session.flush()
            self._session.refresh(offer)
            notify_request_realtime(self._session, request)
            return self._to_offer_dto(offer)

        if request.assigned_driver_id not in {None, locked_driver.id}:
            raise ConflictError("La oferta ya no está disponible")
        if request.status == "assigned" and request.assigned_driver_id == locked_driver.id:
            offer.status = "accepted"
            offer.responded_at = now
            self._session.flush()
            self._session.refresh(offer)
            notify_request_realtime(self._session, request)
            return self._to_offer_dto(offer)
        if request.status not in {"offered", "searching"}:
            raise ConflictError("La oferta ya no está disponible")
        if not self._can_claim_request(request, locked_driver.id):
            raise ConflictError("La oferta ya no está disponible")

        had_in_transit = (
            self._session.scalar(
                select(DeliveryDispatchRequest.id).where(
                    DeliveryDispatchRequest.assigned_driver_id == locked_driver.id,
                    DeliveryDispatchRequest.status == "in_transit",
                )
            )
            is not None
        )
        offer.status = "accepted"
        offer.responded_at = now
        if request not in group_rows:
            group_rows = [request, *group_rows]
        claimed: list[DeliveryDispatchRequest] = []
        for row in group_rows:
            if not self._can_claim_request(row, locked_driver.id):
                continue
            row.status = "assigned"
            row.assigned_driver_id = locked_driver.id
            if row.payment_method == "cash":
                self._ensure_cash_hold(row, locked_driver, row.credit_hold)
            claimed.append(row)
        rebuild_driver_itinerary(
            self._session,
            locked_driver.id,
            case=offer.case_applied,
            rider_lat=locked_driver.last_lat,
            rider_lng=locked_driver.last_lng,
            pre_free=had_in_transit and offer.case_applied in {"A", "E"},
            new_request_ids={str(row.id) for row in claimed},
        )
        self._session.flush()
        self._session.refresh(offer)
        for row in claimed:
            notify_request_realtime(self._session, row)
        return self._to_offer_dto(offer)

    def _can_claim_request(
        self,
        row: DeliveryDispatchRequest,
        driver_id: uuid.UUID,
    ) -> bool:
        if row.status not in {"scheduled", "searching", "offered"}:
            return False
        if row.assigned_driver_id not in {None, driver_id}:
            return False
        live = self._session.scalar(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id == row.id,
                DeliveryDispatchOffer.status == "offered",
            )
        )
        if live is not None and live.driver_id != driver_id:
            return False
        return True

    def reject_offer(self, user: UserDTO, offer_id: uuid.UUID) -> RiderOfferDTO:
        driver = self._require_driver(user)
        now = datetime.now(UTC)
        peek = self._session.get(DeliveryDispatchOffer, offer_id)
        if peek is None or peek.driver_id != driver.id:
            raise ConflictError("La oferta ya no está disponible")
        request, _group = lock_request_and_group(self._session, peek.request_id)
        offer = self._session.scalar(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.id == offer_id,
                DeliveryDispatchOffer.driver_id == driver.id,
            )
            .with_for_update()
        )
        if offer is None or offer.status != "offered":
            raise ConflictError("La oferta ya no está disponible")
        if request is None:
            request = self._session.scalar(
                select(DeliveryDispatchRequest)
                .where(DeliveryDispatchRequest.id == offer.request_id)
                .with_for_update()
            )
        if request is None:
            raise ConflictError("La oferta ya no está disponible")
        reject_offer_and_search(self._session, offer, request, now)
        self._session.flush()
        self._session.refresh(offer)
        notify_request_realtime(self._session, request)
        notify_rider_updated(driver.id)
        return self._to_offer_dto(offer)

    def transition_assignment(
        self,
        user: UserDTO,
        request_id: uuid.UUID,
        new_status: str,
    ) -> RiderAssignmentDTO:
        expected = _ASSIGNMENT_TRANSITIONS[new_status]
        driver = self._require_driver(user)
        request = self._session.scalar(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.id == request_id)
            .with_for_update()
        )
        if request is None or request.assigned_driver_id != driver.id:
            raise NotFoundError("Solicitud de delivery no encontrada")
        if request.status != expected:
            raise ConflictError("No puedes cambiar el estado de este envío")
        request.status = new_status
        now = datetime.now(UTC)
        if new_status == "picked_up":
            request.picked_up_at = now
            complete_stop(self._session, driver.id, request.id, "restaurant")
        elif new_status == "in_transit":
            request.in_transit_at = now
        elif new_status == "delivered":
            request.delivered_at = now
            complete_stop(self._session, driver.id, request.id, "dropoff")
        self._session.flush()
        self._session.refresh(request)
        notify_request_realtime(self._session, request)
        cases = self._accepted_cases([request])
        return self._to_assignment_dto(request, case_applied=cases.get(request.id))

    def _swap_assigned_driver(
        self,
        request: DeliveryDispatchRequest,
        new_driver: DeliveryDriver,
        now: datetime,
    ) -> None:
        previous_id = request.assigned_driver_id
        if previous_id == new_driver.id:
            return
        hold = request.credit_hold
        if previous_id is not None and previous_id != new_driver.id:
            previous = self._session.scalar(
                select(DeliveryDriver).where(DeliveryDriver.id == previous_id).with_for_update()
            )
            if hold is not None and hold.status == "held":
                if previous is not None:
                    previous.credit_held_cents = max(
                        0, previous.credit_held_cents - hold.amount_cents
                    )
                hold.driver_id = new_driver.id
                new_driver.credit_held_cents += hold.amount_cents
            elif request.payment_method == "cash":
                self._ensure_cash_hold(request, new_driver, hold)
        elif request.payment_method == "cash":
            self._ensure_cash_hold(request, new_driver, hold)
        request.assigned_driver_id = new_driver.id
        request.status = "assigned"

    def _ensure_cash_hold(
        self,
        request: DeliveryDispatchRequest,
        driver: DeliveryDriver,
        hold: DeliveryCreditHold | None,
    ) -> None:
        if hold is None:
            self._session.add(
                DeliveryCreditHold(
                    driver_id=driver.id,
                    request_id=request.id,
                    amount_cents=request.collect_cents,
                    status="held",
                )
            )
            driver.credit_held_cents += request.collect_cents
            return
        if hold.status == "released":
            hold.status = "held"
            hold.driver_id = driver.id
            hold.released_at = None
            hold.released_by_user_id = None
            driver.credit_held_cents += hold.amount_cents
            return
        if hold.driver_id != driver.id:
            hold.driver_id = driver.id
            driver.credit_held_cents += hold.amount_cents

    def _require_driver(self, user: UserDTO) -> DeliveryDriver:
        driver = self._driver_for_user(user.id)
        if driver is None:
            # Only claim unlinked rows once; skip on hot paths (location pings).
            claim_drivers(self._session, user.id, user.email or "")
            driver = self._driver_for_user(user.id)
        if driver is None:
            raise ForbiddenError("Tu correo no está dado de alta. Pide a Mexy que te registre.")
        return driver

    def _driver_for_user(self, user_id: uuid.UUID) -> DeliveryDriver | None:
        return self._session.scalar(
            select(DeliveryDriver)
            .where(DeliveryDriver.user_id == user_id)
            .order_by(DeliveryDriver.created_at.desc())
        )

    def _to_profile(self, driver: DeliveryDriver) -> RiderProfileDTO:
        profile = RiderProfileDTO.model_validate(driver)
        profile.assignments = self._list_assignments(driver.id)
        profile.itinerary = hydrate_itinerary(self._session, driver.id)
        return profile

    def _list_assignments(self, driver_id: uuid.UUID) -> list[RiderAssignmentDTO]:
        rows = self._session.execute(
            select(DeliveryDispatchRequest, Restaurant)
            .join(Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id)
            .where(
                DeliveryDispatchRequest.assigned_driver_id == driver_id,
                DeliveryDispatchRequest.status.in_(_ACTIVE_ASSIGNMENT_STATUSES),
            )
        ).all()
        cases = self._accepted_cases([request for request, _ in rows])
        plan = load_plan(self._session, driver_id)
        order = {stop.request_id: index for index, stop in enumerate(plan)}
        assignments = [
            self._to_assignment_dto(
                request,
                restaurant,
                case_applied=cases.get(request.id),
            )
            for request, restaurant in rows
        ]
        assignments.sort(
            key=lambda item: (
                order.get(str(item.id), 99),
                _ASSIGNMENT_STATUS_ORDER.get(item.status, 99),
            )
        )
        return assignments

    def _accepted_cases(self, requests: list[DeliveryDispatchRequest]) -> dict[uuid.UUID, str]:
        if not requests:
            return {}
        request_ids = [request.id for request in requests]
        offers = self._session.scalars(
            select(DeliveryDispatchOffer).where(
                DeliveryDispatchOffer.request_id.in_(request_ids),
                DeliveryDispatchOffer.status == "accepted",
            )
        ).all()
        latest: dict[uuid.UUID, DeliveryDispatchOffer] = {}
        for offer in offers:
            current = latest.get(offer.request_id)
            offer_at = offer.responded_at or offer.created_at
            current_at = current.responded_at or current.created_at if current is not None else None
            if current is None or (
                offer_at is not None and (current_at is None or offer_at >= current_at)
            ):
                latest[offer.request_id] = offer
        cases = {request_id: offer.case_applied for request_id, offer in latest.items()}
        group_case: dict[uuid.UUID, str] = {}
        for request in requests:
            case = cases.get(request.id)
            if request.dispatch_group_id is not None and case:
                group_case[request.dispatch_group_id] = case
        for request in requests:
            if request.id in cases or request.dispatch_group_id is None:
                continue
            inherited = group_case.get(request.dispatch_group_id)
            if inherited is not None:
                cases[request.id] = inherited
        return cases

    def _to_assignment_dto(
        self,
        request: DeliveryDispatchRequest,
        restaurant: Restaurant | None = None,
        *,
        case_applied: str | None = None,
    ) -> RiderAssignmentDTO:
        if restaurant is None:
            restaurant = self._session.get(Restaurant, request.restaurant_id)
        restaurant_name = restaurant.name if restaurant is not None else ""
        restaurant_address = restaurant.address if restaurant is not None else None
        picked_up = request.status in {"picked_up", "in_transit"}
        return RiderAssignmentDTO(
            id=request.id,
            short_id=request.short_id,
            status=request.status,
            restaurant_name=restaurant_name,
            restaurant_address=restaurant_address,
            dropoff_address=request.dropoff_address,
            restaurant_lat=restaurant.latitude if restaurant is not None else None,
            restaurant_lng=restaurant.longitude if restaurant is not None else None,
            dropoff_lat=request.dropoff_lat,
            dropoff_lng=request.dropoff_lng,
            payment_method=request.payment_method,
            collect_cents=request.collect_cents,
            cash_denomination_cents=(
                request.cash_denomination_cents if request.payment_method == "cash" else None
            ),
            quoted_fee_cents=request.quoted_fee_cents,
            package_count=request.package_count,
            package_size=request.package_size,
            notes=request.notes,
            customer_name=request.customer_name if picked_up else None,
            customer_phone=request.customer_phone if picked_up else None,
            case_applied=case_applied,
            dispatch_group_id=request.dispatch_group_id,
        )

    def _to_offer_dto(self, offer: DeliveryDispatchOffer) -> RiderOfferDTO:
        request = offer.request
        if request is None:
            request = self._session.get(DeliveryDispatchRequest, offer.request_id)
        if request is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        restaurant = self._session.get(Restaurant, request.restaurant_id)
        restaurant_name = restaurant.name if restaurant is not None else ""
        members = [request]
        if request.dispatch_group_id is not None:
            grouped = list(
                self._session.scalars(
                    select(DeliveryDispatchRequest).where(
                        DeliveryDispatchRequest.dispatch_group_id == request.dispatch_group_id
                    )
                ).all()
            )
            others = [row for row in grouped if row.id != request.id]
            members = [request, *others]
        driver = self._session.get(DeliveryDriver, offer.driver_id)
        start_lat = driver.last_lat if driver is not None else None
        start_lng = driver.last_lng if driver is not None else None
        stop_payloads: list[dict] = []
        for member in members:
            member_restaurant = self._session.get(Restaurant, member.restaurant_id)
            restaurant_lat = member_restaurant.latitude if member_restaurant is not None else None
            restaurant_lng = member_restaurant.longitude if member_restaurant is not None else None
            distance_meters = None
            if restaurant_lat is not None and restaurant_lng is not None:
                distance_meters = round(
                    geodesic_meters(
                        restaurant_lat,
                        restaurant_lng,
                        member.dropoff_lat,
                        member.dropoff_lng,
                    )
                )
            stop_payloads.append(
                {
                    "restaurant_name": (
                        member_restaurant.name if member_restaurant is not None else ""
                    ),
                    "dropoff_address": member.dropoff_address,
                    "short_id": member.short_id,
                    "restaurant_lat": restaurant_lat,
                    "restaurant_lng": restaurant_lng,
                    "dropoff_lat": member.dropoff_lat,
                    "dropoff_lng": member.dropoff_lng,
                    "distance_meters": distance_meters,
                    "package_count": member.package_count,
                    "payment_method": member.payment_method,
                    "collect_cents": member.collect_cents,
                }
            )
        stop_payloads = order_offer_stops(stop_payloads, start_lat, start_lng)
        totals = group_offer_totals(stop_payloads)
        stops = [
            RiderOfferStopDTO(
                restaurant_name=row["restaurant_name"],
                dropoff_address=row["dropoff_address"],
                short_id=row["short_id"],
                restaurant_lat=row["restaurant_lat"],
                restaurant_lng=row["restaurant_lng"],
                dropoff_lat=row["dropoff_lat"],
                dropoff_lng=row["dropoff_lng"],
                distance_meters=row["distance_meters"],
            )
            for row in stop_payloads
        ]
        primary = stops[0] if stops else None
        distances = [stop.distance_meters for stop in stops if stop.distance_meters is not None]
        return RiderOfferDTO(
            id=offer.id,
            request_id=offer.request_id,
            short_id=request.short_id,
            status=offer.status,
            case_applied=offer.case_applied,
            expires_at=offer.expires_at,
            restaurant_name=restaurant_name,
            dropoff_address=request.dropoff_address,
            collect_cents=totals["collect_cents"],
            quoted_fee_cents=sum(member.quoted_fee_cents for member in members),
            payment_method=totals["payment_method"],
            package_count=totals["package_count"],
            restaurant_lat=primary.restaurant_lat if primary is not None else None,
            restaurant_lng=primary.restaurant_lng if primary is not None else None,
            dropoff_lat=request.dropoff_lat,
            dropoff_lng=request.dropoff_lng,
            distance_meters=sum(distances) if distances else None,
            stops=stops,
        )
