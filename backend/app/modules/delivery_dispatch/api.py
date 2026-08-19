from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.delivery_dispatch.schemas import (
    AssignmentLogDTO,
    AssignmentSettingsDTO,
    AssignmentSettingsUpdate,
    DeliveryDriverCreate,
    DeliveryDriverDocumentsUpdate,
    DeliveryDriverDTO,
    DeliveryDriverUpdate,
    DriverItineraryStopDTO,
    ItineraryUpdate,
    ManualOfferCreate,
    ManualOfferDTO,
    ProviderHistoryPageDTO,
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


@router.get(
    "/me/dispatch-requests/{request_id}/assignment-log",
    response_model=AssignmentLogDTO,
)
def get_assignment_log(
    request_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> AssignmentLogDTO:
    return service.get_assignment_log(user.id, request_id)


@router.patch(
    "/me/drivers/{driver_id}/itinerary",
    response_model=list[DriverItineraryStopDTO],
)
def patch_driver_itinerary(
    driver_id: UUID,
    data: ItineraryUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> list[DriverItineraryStopDTO]:
    return service.update_driver_itinerary(user.id, driver_id, data)


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


@router.get("/me/dispatch-history", response_model=ProviderHistoryPageDTO)
def list_dispatch_history_endpoint(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    status: Literal["delivered", "cancelled"] | None = Query(default=None),
    driver_id: UUID | None = Query(default=None),
    zone_id: UUID | None = Query(default=None),
    restaurant_id: UUID | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ProviderHistoryPageDTO:
    return service.list_history(
        user.id,
        start=start,
        end=end,
        status=status,
        driver_id=driver_id,
        zone_id=zone_id,
        restaurant_id=restaurant_id,
        limit=limit,
        offset=offset,
    )
