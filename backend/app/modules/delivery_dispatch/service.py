from __future__ import annotations

import base64
import binascii
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
    DeliveryProviderAssignmentSettings,
    DeliveryProviderMember,
    DeliverySearchLeadTime,
    RestaurantDeliveryProvider,
)
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.maps_url import parse_maps_url
from app.modules.delivery_dispatch.schemas import (
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    DeliveryDriverCreate,
    DeliveryDriverDocumentsUpdate,
    DeliveryDriverDTO,
    DeliveryDriverUpdate,
    DispatchPaymentUpdate,
    DispatchRequestCreate,
    DispatchRequestDTO,
    PublicDispatchTrackingDTO,
    RiderAssignmentDTO,
    RiderOfferDTO,
    RiderOfferStopDTO,
    RiderProfileDTO,
    SearchLeadTimeDTO,
    SearchLeadTimeUpdate,
    TrackingDropoffDTO,
    TrackingRiderDTO,
)
from app.modules.delivery_dispatch.search_at import compute_search_at
from app.modules.delivery_dispatch.tasks import (
    close_offered_offers,
    enqueue,
    reject_offer_and_search,
    release_group_on_cancel,
    reset_cycle_driver_ids,
)
from app.modules.delivery_providers.permissions import (
    require_view_drivers,
    require_write_provider_config,
)
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.modules.public.delivery_quote_service import PublicDeliveryQuoteService
from app.db.models.restaurant import Restaurant
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
            .where(DeliveryDriver.delivery_provider_id == provider_id)
            .order_by(DeliveryDriver.created_at.desc())
        ).all()
        return [DeliveryDriverDTO.model_validate(row) for row in rows]

    def get_driver(self, user_id: uuid.UUID, driver_id: uuid.UUID) -> DeliveryDriverDTO:
        provider_id, member_role = self._require_provider_with_role(user_id)
        require_view_drivers(member_role)
        row = self._get_driver_or_raise(provider_id, driver_id)
        return DeliveryDriverDTO.model_validate(row)

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
            profile_photo_path=profile_photo_path,
            ine_document_path=ine_document_path,
            license_document_path=license_document_path,
            insurance_document_path=insurance_document_path,
            credit_limit_cents=data.credit_limit_cents,
            credit_held_cents=0,
            compartment_size=compartment,
            plate=data.plate.strip(),
            motorcycle_brand=data.motorcycle_brand.strip(),
            motorcycle_color=data.motorcycle_color.strip(),
            status="invited",
            is_online=False,
        )
        self._session.add(row)
        self._session.flush()
        self._session.refresh(row)
        return DeliveryDriverDTO.model_validate(row)

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

        text_fields = (
            "first_name",
            "last_name",
            "phone",
            "plate",
            "motorcycle_brand",
            "motorcycle_color",
        )
        for field in text_fields:
            if field in updates and updates[field] is not None:
                updates[field] = updates[field].strip()

        for field, value in updates.items():
            setattr(row, field, value)

        self._session.flush()
        self._session.refresh(row)
        return DeliveryDriverDTO.model_validate(row)

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
        return DeliveryDriverDTO.model_validate(row)

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
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
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

        ext = self._extension_for_content_type(content_type, file_name)
        safe_name = (file_name or f"{label}.{ext}").rsplit(".", 1)[0]
        path = f"delivery-drivers/{provider_id}/{uuid.uuid4()}/{safe_name}.{ext}"
        stored = self._storage.upload(path, raw, content_type)
        return stored.path

    @staticmethod
    def _extension_for_content_type(content_type: str, file_name: str | None) -> str:
        if content_type == "application/pdf":
            return "pdf"
        if content_type == "image/jpeg":
            return "jpg"
        if content_type == "image/png":
            return "png"
        if content_type == "image/webp":
            return "webp"
        if file_name and "." in file_name:
            return file_name.rsplit(".", 1)[-1].lower()
        return "bin"

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
_SHORT_MAPS_HOSTS = frozenset({"maps.app.goo.gl", "goo.gl"})


class _CappedRedirectHandler(HTTPRedirectHandler):
    max_redirections = 5


def _follow_maps_redirects(url: str) -> str | None:
    opener = build_opener(_CappedRedirectHandler)
    request = Request(
        url,
        headers={"User-Agent": "MexyDispatch/1.0"},
        method="GET",
    )
    try:
        with opener.open(request, timeout=5) as response:
            return str(response.geturl())
    except (URLError, TimeoutError, ValueError, OSError):
        return None


class RestaurantDispatchService:
    def __init__(
        self,
        session: Session,
        provider_repo: DeliveryProviderRepository,
    ) -> None:
        self._session = session
        self._provider_repo = provider_repo
        self._quotes = PublicDeliveryQuoteService(provider_repo)

    def create(
        self,
        restaurant: RestaurantDTO,
        data: DispatchRequestCreate,
    ) -> DispatchRequestDTO:
        partnership = self._active_partnership(restaurant.id)
        provider_id = partnership.delivery_provider_id

        latitude, longitude = self._resolve_dropoff_coordinates(data)
        lead_time = self._session.scalar(
            select(DeliverySearchLeadTime).where(
                DeliverySearchLeadTime.delivery_provider_id == provider_id,
                DeliverySearchLeadTime.prep_minutes == data.prep_minutes,
            )
        )
        if lead_time is None:
            raise ValidationError("Ese tiempo de preparación no está configurado")

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
        )
        self._session.refresh(row)
        return DispatchRequestDTO.model_validate(row)

    def list(
        self,
        restaurant: RestaurantDTO,
    ) -> list[DispatchRequestDTO]:
        self._active_partnership(restaurant.id)
        rows = self._session.scalars(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.restaurant_id == restaurant.id)
            .order_by(DeliveryDispatchRequest.created_at.desc())
        ).all()
        return [DispatchRequestDTO.model_validate(row) for row in rows]

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
        now = datetime.now(UTC)
        row.status = "searching"
        row.search_at = now
        row.next_attempt_at = now
        reset_cycle_driver_ids(row)
        enqueue("search", now, {"kind": "search", "request_id": str(row.id)})
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
            select(DeliveryDispatchRequest).where(DeliveryDispatchRequest.tracking_token == token)
        )
        if row is None:
            raise NotFoundError("Solicitud de delivery no encontrada")

        rider = None
        eta_seconds = None
        if row.assigned_driver is not None:
            rider = TrackingRiderDTO(first_name=row.assigned_driver.first_name)
            if (
                row.assigned_driver.last_lat is not None
                and row.assigned_driver.last_lng is not None
            ):
                eta_seconds = round(
                    geodesic_meters(
                        row.assigned_driver.last_lat,
                        row.assigned_driver.last_lng,
                        row.dropoff_lat,
                        row.dropoff_lng,
                    )
                    / 8
                )

        return PublicDispatchTrackingDTO(
            status=row.status,
            dropoff=TrackingDropoffDTO(
                latitude=row.dropoff_lat,
                longitude=row.dropoff_lng,
                address=row.dropoff_address,
            ),
            rider=rider,
            eta_seconds=eta_seconds,
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
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.id == request_id,
                DeliveryDispatchRequest.restaurant_id == restaurant_id,
            )
        )
        if row is None:
            raise NotFoundError("Solicitud de delivery no encontrada")
        return row

    def _resolve_dropoff_coordinates(
        self,
        data: DispatchRequestCreate,
    ) -> tuple[float, float]:
        if data.dropoff_lat is not None and data.dropoff_lng is not None:
            return data.dropoff_lat, data.dropoff_lng
        if not data.dropoff_maps_url:
            raise ValidationError("La ubicación de entrega es obligatoria")

        coordinates = parse_maps_url(data.dropoff_maps_url)
        if coordinates is None:
            host = urlparse(data.dropoff_maps_url).hostname
            if host in _SHORT_MAPS_HOSTS:
                resolved = _follow_maps_redirects(data.dropoff_maps_url)
                coordinates = parse_maps_url(resolved) if resolved else None
        if coordinates is None:
            raise ValidationError("No se pudo leer la ubicación del enlace")
        return coordinates

    @staticmethod
    def _validate_payment(
        payment_method: str,
        collect_cents: int,
        cash_denomination_cents: int | None,
    ) -> None:
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
        return DispatchRequestDTO.model_validate(row)

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


class RiderDispatchService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_me(self, user: UserDTO) -> RiderProfileDTO:
        claim_drivers(self._session, user.id, user.email or "")
        driver = self._driver_for_user(user.id)
        if driver is None:
            raise ForbiddenError(
                "Tu correo no está dado de alta. Pide a Mexy que te registre."
            )
        return self._to_profile(driver)

    def set_online(self, user: UserDTO, is_online: bool) -> RiderProfileDTO:
        driver = self._require_driver(user)
        driver.is_online = is_online
        self._session.flush()
        self._session.refresh(driver)
        return self._to_profile(driver)

    def update_location(
        self,
        user: UserDTO,
        latitude: float,
        longitude: float,
    ) -> RiderProfileDTO:
        driver = self._require_driver(user)
        driver.last_lat = latitude
        driver.last_lng = longitude
        driver.location_updated_at = datetime.now(UTC)
        self._session.flush()
        self._session.refresh(driver)
        return self._to_profile(driver)

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
        offer = self._session.scalar(
            select(DeliveryDispatchOffer)
            .where(
                DeliveryDispatchOffer.id == offer_id,
                DeliveryDispatchOffer.driver_id == driver.id,
            )
            .with_for_update()
        )
        if offer is None or offer.status != "offered" or offer.expires_at <= now:
            raise ConflictError("La oferta ya no está disponible")

        request = self._session.scalar(
            select(DeliveryDispatchRequest)
            .where(DeliveryDispatchRequest.id == offer.request_id)
            .with_for_update()
        )
        if request is None or request.status != "offered":
            raise ConflictError("La oferta ya no está disponible")

        locked_driver = self._session.scalar(
            select(DeliveryDriver).where(DeliveryDriver.id == driver.id).with_for_update()
        )
        assert locked_driver is not None

        offer.status = "accepted"
        offer.responded_at = now
        group_rows = [request]
        if request.dispatch_group_id is not None:
            group_rows = list(
                self._session.scalars(
                    select(DeliveryDispatchRequest)
                    .where(DeliveryDispatchRequest.dispatch_group_id == request.dispatch_group_id)
                    .with_for_update()
                ).all()
            )
            if request not in group_rows:
                group_rows.append(request)
        for row in group_rows:
            if row.status not in {"searching", "offered"}:
                continue
            row.status = "assigned"
            row.assigned_driver_id = locked_driver.id
            if row.payment_method == "cash":
                hold = DeliveryCreditHold(
                    driver_id=locked_driver.id,
                    request_id=row.id,
                    amount_cents=row.collect_cents,
                    status="held",
                )
                self._session.add(hold)
                locked_driver.credit_held_cents += row.collect_cents
        self._session.flush()
        self._session.refresh(offer)
        return self._to_offer_dto(offer)

    def reject_offer(self, user: UserDTO, offer_id: uuid.UUID) -> RiderOfferDTO:
        driver = self._require_driver(user)
        now = datetime.now(UTC)
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
        self._session.flush()
        self._session.refresh(request)
        return self._to_assignment_dto(request)

    def _require_driver(self, user: UserDTO) -> DeliveryDriver:
        claim_drivers(self._session, user.id, user.email or "")
        driver = self._driver_for_user(user.id)
        if driver is None:
            raise ForbiddenError(
                "Tu correo no está dado de alta. Pide a Mexy que te registre."
            )
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
        return profile

    def _list_assignments(self, driver_id: uuid.UUID) -> list[RiderAssignmentDTO]:
        rows = self._session.execute(
            select(DeliveryDispatchRequest, Restaurant.name).join(
                Restaurant, Restaurant.id == DeliveryDispatchRequest.restaurant_id
            ).where(
                DeliveryDispatchRequest.assigned_driver_id == driver_id,
                DeliveryDispatchRequest.status.in_(_ACTIVE_ASSIGNMENT_STATUSES),
            )
        ).all()
        assignments = [self._to_assignment_dto(row, restaurant_name) for row, restaurant_name in rows]
        assignments.sort(key=lambda item: _ASSIGNMENT_STATUS_ORDER.get(item.status, 99))
        return assignments

    def _to_assignment_dto(
        self,
        request: DeliveryDispatchRequest,
        restaurant_name: str | None = None,
    ) -> RiderAssignmentDTO:
        if restaurant_name is None:
            restaurant = self._session.get(Restaurant, request.restaurant_id)
            restaurant_name = restaurant.name if restaurant is not None else ""
        return RiderAssignmentDTO(
            id=request.id,
            status=request.status,
            restaurant_name=restaurant_name,
            dropoff_address=request.dropoff_address,
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
        stops = []
        for member in members:
            member_restaurant = self._session.get(Restaurant, member.restaurant_id)
            stops.append(
                RiderOfferStopDTO(
                    restaurant_name=(
                        member_restaurant.name if member_restaurant is not None else ""
                    ),
                    dropoff_address=member.dropoff_address,
                )
            )
        return RiderOfferDTO(
            id=offer.id,
            request_id=offer.request_id,
            status=offer.status,
            case_applied=offer.case_applied,
            expires_at=offer.expires_at,
            restaurant_name=restaurant_name,
            dropoff_address=request.dropoff_address,
            collect_cents=request.collect_cents,
            payment_method=request.payment_method,
            package_count=request.package_count,
            stops=stops,
        )
