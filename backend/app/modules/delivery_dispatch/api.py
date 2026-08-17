from fastapi import APIRouter, Depends

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.delivery_dispatch.schemas import (
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    SearchLeadTimeDTO,
    SearchLeadTimeUpdate,
)
from app.modules.delivery_dispatch.service import DeliveryDispatchService
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/delivery-providers", tags=["delivery-dispatch"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeliveryDispatchService:
    return DeliveryDispatchService(
        uow.session,
        SqlAlchemyDeliveryProviderRepository(uow.session),
    )


@router.get("/me/assignment-settings", response_model=AssignmentSettingsDTO)
def get_assignment_settings(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> AssignmentSettingsDTO:
    return service.get_assignment_settings(user.id)


@router.patch("/me/assignment-settings", response_model=AssignmentSettingsDTO)
def patch_assignment_settings(
    data: AssignmentSettingsUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> AssignmentSettingsDTO:
    return service.update_assignment_settings(user.id, data)


@router.get("/me/search-lead-times", response_model=list[SearchLeadTimeDTO])
def get_search_lead_times(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> list[SearchLeadTimeDTO]:
    return service.list_search_lead_times(user.id)


@router.patch("/me/search-lead-times", response_model=list[SearchLeadTimeDTO])
def patch_search_lead_times(
    data: list[SearchLeadTimeUpdate],
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> list[SearchLeadTimeDTO]:
    return service.update_search_lead_times(user.id, data)
