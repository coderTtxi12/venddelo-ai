from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryPartnershipRequestDTO,
    DeliveryProviderDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
    DeliveryProviderPaymentMethodCreate,
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderProfileUpdate,
    DeliveryProviderScheduleCreate,
    DeliveryProviderScheduleDTO,
    DeliveryProviderServiceStatusDTO,
    DeliveryProviderServiceStatusUpdate,
    DeliveryProviderPricingResponse,
    DeliveryProviderPricingUpdate,
    DeliveryProviderWeatherModeUpdate,
    DeliveryPricingQuoteDTO,
    DeliveryPricingSimulateRequest,
)
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.delivery_providers.service import DeliveryProviderService
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/delivery-providers", tags=["delivery-providers"])


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
    return service.get_me(user.id)


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


@router.get("/me/schedules", response_model=list[DeliveryProviderScheduleDTO])
def list_my_delivery_provider_schedules(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> list[DeliveryProviderScheduleDTO]:
    return service.list_schedules(user.id)


@router.put("/me/schedules", status_code=status.HTTP_204_NO_CONTENT)
def set_my_delivery_provider_schedules(
    schedules: list[DeliveryProviderScheduleCreate],
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> None:
    service.set_schedules(user.id, schedules)


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
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderServiceStatusDTO:
    return service.get_service_status(user.id)


@router.patch("/me/service-status", response_model=DeliveryProviderServiceStatusDTO)
def update_my_delivery_provider_service_status(
    data: DeliveryProviderServiceStatusUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderServiceStatusDTO:
    return service.update_service_status(user.id, data)


@router.get("/me/pricing", response_model=DeliveryProviderPricingResponse)
def get_my_delivery_provider_pricing(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.get_pricing(user.id)


@router.put("/me/pricing", response_model=DeliveryProviderPricingResponse)
def update_my_delivery_provider_pricing(
    data: DeliveryProviderPricingUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.update_pricing(user.id, data)


@router.patch("/me/pricing/weather-mode", response_model=DeliveryProviderPricingResponse)
def update_my_delivery_provider_weather_mode(
    data: DeliveryProviderWeatherModeUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryProviderPricingResponse:
    return service.update_weather_mode(user.id, data)


@router.post("/me/pricing/simulate", response_model=DeliveryPricingQuoteDTO)
def simulate_my_delivery_provider_pricing(
    data: DeliveryPricingSimulateRequest,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryProviderService = Depends(_service),
) -> DeliveryPricingQuoteDTO:
    return service.simulate_pricing(user.id, data)


@router.get("/me/partnership-requests", response_model=list[DeliveryPartnershipRequestDTO])
def list_my_partnership_requests(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryPartnershipRequestDTO]:
    return service.list_pending_requests(user.id)


@router.get("/me/partnerships", response_model=list[DeliveryPartnershipRequestDTO])
def list_my_active_partnerships(
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryPartnershipRequestDTO]:
    return service.list_active_requests(user.id)


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
