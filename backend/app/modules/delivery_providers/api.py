from fastapi import APIRouter, Depends, status

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.delivery_providers.schemas import (
    DeliveryProviderDTO,
    DeliveryProviderMeResponse,
    DeliveryProviderOnboardingSubmit,
    DeliveryProviderProfileUpdate,
)
from app.modules.delivery_providers.service import DeliveryProviderService
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/delivery-providers", tags=["delivery-providers"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeliveryProviderService:
    return DeliveryProviderService(
        SqlAlchemyDeliveryProviderRepository(uow.session),
        build_storage(),
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
