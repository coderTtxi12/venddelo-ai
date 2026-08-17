from __future__ import annotations

import base64
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.storage import StoragePort
from app.db.models.delivery import DeliveryDriver, DeliveryProviderMember
from app.modules.delivery_dispatch.schemas import (
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    DeliveryDriverCreate,
    DeliveryDriverDocumentsUpdate,
    DeliveryDriverDTO,
    DeliveryDriverUpdate,
    SearchLeadTimeDTO,
    SearchLeadTimeUpdate,
)
from app.modules.delivery_providers.permissions import require_write_provider_config
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.db.models.delivery import (
    DeliveryProviderAssignmentSettings,
    DeliverySearchLeadTime,
)

_ALLOWED_DOCUMENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "application/pdf"}
)
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
        provider_id = self._require_provider_id(user_id)
        rows = self._session.scalars(
            select(DeliveryDriver)
            .where(DeliveryDriver.delivery_provider_id == provider_id)
            .order_by(DeliveryDriver.created_at.desc())
        ).all()
        return [DeliveryDriverDTO.model_validate(row) for row in rows]

    def get_driver(self, user_id: uuid.UUID, driver_id: uuid.UUID) -> DeliveryDriverDTO:
        provider_id = self._require_provider_id(user_id)
        row = self._get_driver_or_raise(provider_id, driver_id)
        return DeliveryDriverDTO.model_validate(row)

    def create_driver(
        self, user_id: uuid.UUID, data: DeliveryDriverCreate
    ) -> DeliveryDriverDTO:
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

        for field in ("first_name", "last_name", "phone", "plate", "motorcycle_brand", "motorcycle_color"):
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

        raw = base64.b64decode(match.group(2), validate=True)
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

    def _get_driver_or_raise(
        self, provider_id: uuid.UUID, driver_id: uuid.UUID
    ) -> DeliveryDriver:
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

    def _require_provider_with_role(
        self, user_id: uuid.UUID
    ) -> tuple[uuid.UUID, str]:
        found = self._provider_repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un proveedor de delivery registrado")
        provider, member_role = found
        return provider.id, member_role

    def _get_or_raise_settings(
        self, provider_id: uuid.UUID
    ) -> DeliveryProviderAssignmentSettings:
        row = self._session.scalar(
            select(DeliveryProviderAssignmentSettings).where(
                DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
            )
        )
        if row is None:
            raise NotFoundError("Configuración de asignación no encontrada")
        return row
