from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.delivery_dispatch.schemas import (
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    DeliveryDriverCreate,
    DeliveryDriverDocumentsUpdate,
    DeliveryDriverDTO,
    DeliveryDriverUpdate,
    ManualOfferCreate,
    ManualOfferDTO,
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
        build_storage(),
    )


@router.get("/me/drivers", response_model=list[DeliveryDriverDTO])
def list_drivers(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> list[DeliveryDriverDTO]:
    return service.list_drivers(user.id)


@router.post(
    "/me/drivers",
    response_model=DeliveryDriverDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_driver(
    data: DeliveryDriverCreate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> DeliveryDriverDTO:
    return service.create_driver(user.id, data)


@router.get("/me/drivers/{driver_id}", response_model=DeliveryDriverDTO)
def get_driver(
    driver_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> DeliveryDriverDTO:
    return service.get_driver(user.id, driver_id)


@router.patch("/me/drivers/{driver_id}", response_model=DeliveryDriverDTO)
def patch_driver(
    driver_id: UUID,
    data: DeliveryDriverUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> DeliveryDriverDTO:
    return service.update_driver(user.id, driver_id, data)


@router.post("/me/drivers/{driver_id}/documents", response_model=DeliveryDriverDTO)
def upload_driver_documents(
    driver_id: UUID,
    data: DeliveryDriverDocumentsUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> DeliveryDriverDTO:
    return service.upload_driver_documents(user.id, driver_id, data)


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


@router.post(
    "/me/dispatch-requests/{request_id}/manual-offer",
    response_model=ManualOfferDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_manual_offer(
    request_id: UUID,
    data: ManualOfferCreate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> ManualOfferDTO:
    return service.create_manual_offer(user.id, request_id, data)


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
