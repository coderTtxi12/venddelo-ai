from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from app.api.deps import get_synced_user
from app.core.exceptions import ValidationError
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipRequestDTO,
    DeliveryPartnershipZoneUpdate,
    DeliveryPricingQuoteDTO,
    DeliveryPricingSimulateRequest,
    DeliveryProviderAdminInviteCreate,
    DeliveryProviderAdminInviteDTO,
    DeliveryProviderDTO,
    DeliveryProviderMemberDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
    DeliveryProviderPaymentMethodCreate,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderPricingResponse,
    DeliveryProviderPricingUpdate,
    DeliveryProviderProfileUpdate,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderServiceStatusUpdate,
    DeliveryProviderWeatherModeUpdate,
    DeliveryProviderZoneDTO,
    DeliveryProviderZoneWrite,
    RiderApkDTO,
    RiderApkUploadBegin,
    RiderApkUploadComplete,
    RiderApkUploadSessionDTO,
    RiderApkUrlUpdate,
)
from app.modules.delivery_providers.service import DeliveryProviderService
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/delivery-providers", tags=["delivery-providers"])


def _require_zone_id(zone_id: UUID | None = Query(default=None)) -> UUID:
    if zone_id is None:
        raise ValidationError("Indica la zona")
    return zone_id


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeliveryProviderService:
    return DeliveryProviderService(
        SqlAlchemyDeliveryProviderRepository(uow.session),
        build_storage(),
    )


def _partnership_service(
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> DeliveryPartnershipService:
    return DeliveryPartnershipService(
        SqlAlchemyDeliveryProviderRepository(uow.session),
        restaurant_repo=uow.restaurants,
    )


@router.get("/me", response_model=DeliveryProviderMeResponse)
def get_my_delivery_provider(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderMeResponse:
    return service.get_me(user.id, user.email)


@router.get("/me/rider-apk", response_model=RiderApkDTO)
def get_rider_apk(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> RiderApkDTO:
    return service.get_rider_apk(user.id)


@router.patch("/me/rider-apk", response_model=RiderApkDTO)
def patch_rider_apk_url(
    data: RiderApkUrlUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> RiderApkDTO:
    return service.set_rider_apk_url(user.id, data)


@router.post(
    "/me/rider-apk",
    response_model=RiderApkDTO,
    status_code=status.HTTP_201_CREATED,
)
def upload_rider_apk(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
    file: UploadFile = File(...),
) -> RiderApkDTO:
    payload = file.file.read()
    return service.upload_rider_apk(
        user.id,
        filename=file.filename,
        payload=payload,
        content_type=file.content_type,
    )


@router.post("/me/rider-apk/uploads", response_model=RiderApkUploadSessionDTO)
def begin_rider_apk_upload(
    data: RiderApkUploadBegin,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> RiderApkUploadSessionDTO:
    return service.begin_rider_apk_upload(user.id, data)


@router.post("/me/rider-apk/uploads/complete", response_model=RiderApkDTO)
def complete_rider_apk_upload(
    data: RiderApkUploadComplete,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> RiderApkDTO:
    return service.complete_rider_apk_upload(user.id, data)


@router.post(
    "/onboarding",
    response_model=DeliveryProviderDTO,
    status_code=status.HTTP_201_CREATED,
)
def submit_delivery_provider_onboarding(
    data: DeliveryProviderOnboardingSubmit,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderDTO:
    return service.submit_onboarding(user.id, data)


@router.patch("/me", response_model=DeliveryProviderDTO)
def update_my_delivery_provider(
    data: DeliveryProviderProfileUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderDTO:
    return service.update_profile(user.id, data)


@router.get("/me/zones", response_model=list[DeliveryProviderZoneDTO])
def list_my_delivery_provider_zones(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderZoneDTO]:
    return service.list_zones(user.id)


@router.post(
    "/me/zones",
    response_model=DeliveryProviderZoneDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_my_delivery_provider_zone(
    data: DeliveryProviderZoneWrite,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderZoneDTO:
    return service.create_zone(user.id, data)


@router.get("/me/zones/{zone_id}", response_model=DeliveryProviderZoneDTO)
def get_my_delivery_provider_zone(
    zone_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderZoneDTO:
    return service.get_zone(user.id, zone_id)


@router.patch("/me/zones/{zone_id}", response_model=DeliveryProviderZoneDTO)
def update_my_delivery_provider_zone(
    zone_id: UUID,
    data: DeliveryProviderZoneWrite,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderZoneDTO:
    return service.update_zone(user.id, zone_id, data)


@router.delete("/me/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_delivery_provider_zone(
    zone_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> None:
    service.delete_zone(user.id, zone_id)


@router.get("/me/admin-invites", response_model=list[DeliveryProviderAdminInviteDTO])
def list_my_delivery_provider_admin_invites(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderAdminInviteDTO]:
    return service.list_admin_invites(user.id)


@router.get("/me/members", response_model=list[DeliveryProviderMemberDTO])
def list_my_delivery_provider_members(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderMemberDTO]:
    return service.list_admin_members(user.id)


@router.post(
    "/me/admin-invites",
    response_model=DeliveryProviderAdminInviteDTO,
    status_code=status.HTTP_201_CREATED,
)
def add_my_delivery_provider_admin_invite(
    data: DeliveryProviderAdminInviteCreate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderAdminInviteDTO:
    return service.add_admin_invite(user.id, data)


@router.delete("/me/admin-invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_delivery_provider_admin_invite(
    invite_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> None:
    service.remove_admin_invite(user.id, invite_id)


@router.get("/me/schedules", response_model=list[DeliveryProviderScheduleDTO])
def list_my_delivery_provider_schedules(
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderScheduleDTO]:
    return service.list_schedules(user.id, zone_id)


@router.put("/me/schedules", status_code=status.HTTP_204_NO_CONTENT)
def set_my_delivery_provider_schedules(
    schedules: list[DeliveryProviderScheduleCreate],
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> None:
    service.set_schedules(user.id, zone_id, schedules)


@router.get("/me/payment-methods", response_model=list[DeliveryProviderPaymentMethodDTO])
def list_my_delivery_provider_payment_methods(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderPaymentMethodDTO]:
    return service.list_payment_methods(user.id)


@router.put("/me/payment-methods", response_model=list[DeliveryProviderPaymentMethodDTO])
def set_my_delivery_provider_payment_methods(
    methods: list[DeliveryProviderPaymentMethodCreate],
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderPaymentMethodDTO]:
    return service.set_payment_methods(user.id, methods)


@router.get("/me/service-status", response_model=DeliveryProviderServiceStatusDTO)
def get_my_delivery_provider_service_status(
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderServiceStatusDTO:
    return service.get_service_status(user.id, zone_id)


@router.patch("/me/service-status", response_model=DeliveryProviderServiceStatusDTO)
def update_my_delivery_provider_service_status(
    data: DeliveryProviderServiceStatusUpdate,
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderServiceStatusDTO:
    return service.update_service_status(user.id, zone_id, data)


@router.get("/me/pricing", response_model=DeliveryProviderPricingResponse)
def get_my_delivery_provider_pricing(
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.get_pricing(user.id, zone_id)


@router.put("/me/pricing", response_model=DeliveryProviderPricingResponse)
def update_my_delivery_provider_pricing(
    data: DeliveryProviderPricingUpdate,
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.update_pricing(user.id, zone_id, data)


@router.patch("/me/pricing/weather-mode", response_model=DeliveryProviderPricingResponse)
def update_my_delivery_provider_weather_mode(
    data: DeliveryProviderWeatherModeUpdate,
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.update_weather_mode(user.id, zone_id, data)


@router.post("/me/pricing/simulate", response_model=DeliveryPricingQuoteDTO)
def simulate_my_delivery_provider_pricing(
    data: DeliveryPricingSimulateRequest,
    zone_id: UUID = Depends(_require_zone_id),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryPricingQuoteDTO:
    return service.simulate_pricing(user.id, zone_id, data)


@router.get("/me/partnership-requests", response_model=list[DeliveryPartnershipRequestDTO])
def list_my_partnership_requests(
    zone_id: UUID | None = Query(default=None),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryPartnershipRequestDTO]:
    return service.list_pending_requests(user.id, zone_id)


@router.get("/me/partnerships", response_model=list[DeliveryPartnershipRequestDTO])
def list_my_active_partnerships(
    zone_id: UUID | None = Query(default=None),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryPartnershipRequestDTO]:
    return service.list_active_requests(user.id, zone_id)


@router.patch(
    "/me/partnerships/{link_id}",
    response_model=DeliveryPartnershipRequestDTO,
)
def reassign_partnership_zone(
    link_id: UUID,
    data: DeliveryPartnershipZoneUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> DeliveryPartnershipRequestDTO:
    return service.reassign_zone(user.id, link_id, data.zone_id)


@router.post(
    "/me/partnership-requests/{link_id}/accept",
    response_model=DeliveryPartnershipRequestDTO,
)
def accept_partnership_request(
    link_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> DeliveryPartnershipRequestDTO:
    return service.accept_request(user.id, link_id)


@router.post("/me/partnership-requests/{link_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_partnership_request(
    link_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> None:
    service.reject_request(user.id, link_id)
