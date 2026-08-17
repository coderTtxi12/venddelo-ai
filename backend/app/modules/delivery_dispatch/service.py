from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.delivery_dispatch.schemas import (
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    SearchLeadTimeDTO,
    SearchLeadTimeUpdate,
)
from app.modules.delivery_providers.permissions import require_write_provider_config
from app.modules.delivery_providers.repository import DeliveryProviderRepository
from app.db.models.delivery import (
    DeliveryProviderAssignmentSettings,
    DeliverySearchLeadTime,
)


class DeliveryDispatchService:
    def __init__(self, session: Session, provider_repo: DeliveryProviderRepository) -> None:
        self._session = session
        self._provider_repo = provider_repo

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
