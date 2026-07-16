from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.cache_helpers import notify_digital_menu_preview_changed
from app.api.deps import (
    get_synced_user,
    pagination_params,
    require_owned_restaurant,
)
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantAdminInviteCreate,
    RestaurantAdminInviteDTO,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantAccessListResponse,
    RestaurantMeResponse,
    RestaurantMemberDTO,
    RestaurantSelectRequest,
    RestaurantUpdate,
    ScheduleCreate,
    ScheduleDTO,
    SubdomainAvailabilityDTO,
)
from app.modules.delivery_providers.schemas import (
    DeliveryProviderPaymentMethodDTO,
    DeliveryProviderScheduleDTO,
    RestaurantDeliveryPartnershipResponse,
)
from app.modules.restaurants.service import RestaurantService
from app.modules.users.schemas import UserDTO

router = APIRouter(prefix="/restaurants", tags=["restaurants"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> RestaurantService:
    return RestaurantService(uow.restaurants)


def _partnership_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeliveryPartnershipService:
    return DeliveryPartnershipService(
        SqlAlchemyDeliveryProviderRepository(uow.session),
        restaurant_repo=uow.restaurants,
    )


def _maybe_request_mexy_delivery(
    restaurant: RestaurantDTO,
    partnership: DeliveryPartnershipService,
) -> None:
    if restaurant.delivery_enabled:
        partnership.ensure_mexy_request_for_restaurant(restaurant.id)


def _maybe_request_mexy_delivery_on_enable(
    previous: RestaurantDTO,
    updated: RestaurantDTO,
    partnership: DeliveryPartnershipService,
) -> None:
    if updated.delivery_enabled and not previous.delivery_enabled:
        partnership.ensure_mexy_request_for_restaurant(updated.id)


@router.post("", response_model=RestaurantDTO, status_code=status.HTTP_201_CREATED)
def create_restaurant(
    data: RestaurantCreate,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> RestaurantDTO:
    restaurant = service.create(user.id, data)
    _maybe_request_mexy_delivery(restaurant, partnership)
    return restaurant


@router.get("", response_model=CursorPage[RestaurantDTO])
def list_my_restaurants(
    params: PaginationParams = Depends(pagination_params),
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> CursorPage[RestaurantDTO]:
    return service.list_for_owner(user.id, params)


@router.get("/check-subdomain", response_model=SubdomainAvailabilityDTO)
def check_subdomain_availability(
    subdomain: str = Query(..., min_length=1, max_length=63),
    exclude: UUID | None = Query(None),
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> SubdomainAvailabilityDTO:
    normalized, available, valid, message = service.check_subdomain_availability(
        subdomain,
        exclude_id=exclude,
    )
    return SubdomainAvailabilityDTO(
        subdomain=normalized,
        available=available,
        valid=valid,
        message=message,
    )


@router.get("/me", response_model=RestaurantMeResponse)
def get_my_restaurant(
    restaurant_id: UUID | None = Query(None),
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> RestaurantMeResponse:
    return service.get_me(user.id, user.email, restaurant_id=restaurant_id)


@router.get("/me/access", response_model=RestaurantAccessListResponse)
def list_my_restaurant_access(
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> RestaurantAccessListResponse:
    return service.list_access(user.id, user.email)


@router.post("/me/select", response_model=RestaurantMeResponse)
def select_my_restaurant(
    data: RestaurantSelectRequest,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> RestaurantMeResponse:
    return service.select_restaurant(user.id, data)


@router.get("/me/admin-invites", response_model=list[RestaurantAdminInviteDTO])
def list_my_restaurant_admin_invites(
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> list[RestaurantAdminInviteDTO]:
    return service.list_admin_invites(user.id)


@router.get("/me/members", response_model=list[RestaurantMemberDTO])
def list_my_restaurant_members(
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> list[RestaurantMemberDTO]:
    return service.list_admin_members(user.id)


@router.post(
    "/me/admin-invites",
    response_model=RestaurantAdminInviteDTO,
    status_code=status.HTTP_201_CREATED,
)
def add_my_restaurant_admin_invite(
    data: RestaurantAdminInviteCreate,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> RestaurantAdminInviteDTO:
    return service.add_admin_invite(user.id, data)


@router.delete("/me/admin-invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_restaurant_admin_invite(
    invite_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> None:
    service.remove_admin_invite(user.id, invite_id)


@router.delete("/me/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_restaurant_admin_member(
    member_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RestaurantService = Depends(_service),
) -> None:
    service.remove_admin_member(user.id, member_id)


@router.get("/{restaurant_id}", response_model=RestaurantDTO)
def get_restaurant(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
) -> RestaurantDTO:
    return restaurant


@router.patch("/{restaurant_id}", response_model=RestaurantDTO)
def update_restaurant(
    data: RestaurantUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> RestaurantDTO:
    updated = service.update(restaurant.id, data)
    _maybe_request_mexy_delivery_on_enable(restaurant, updated, partnership)
    notify_digital_menu_preview_changed(restaurant.id)
    return updated


@router.delete("/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_restaurant(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> None:
    service.delete(restaurant.id)


@router.put("/{restaurant_id}/schedules", status_code=status.HTTP_204_NO_CONTENT)
def set_schedules(
    schedules: list[ScheduleCreate],
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> None:
    service.set_schedules(restaurant.id, schedules)
    notify_digital_menu_preview_changed(restaurant.id)


@router.get("/{restaurant_id}/schedules", response_model=list[ScheduleDTO])
def list_schedules(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
) -> list[ScheduleDTO]:
    return service.list_schedules(restaurant.id)


@router.put("/{restaurant_id}/payment-methods", status_code=status.HTTP_204_NO_CONTENT)
def set_payment_methods(
    methods: list[PaymentMethodCreate],
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> None:
    partnership.validate_restaurant_payment_methods(restaurant.id, methods)
    service.set_payment_methods(restaurant.id, methods)


@router.get("/{restaurant_id}/payment-methods", response_model=list[PaymentMethodDTO])
def list_payment_methods(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: RestaurantService = Depends(_service),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[PaymentMethodDTO]:
    partnership.ensure_restaurant_delivery_payment_methods(restaurant.id)
    return service.list_payment_methods(restaurant.id)


@router.get(
    "/{restaurant_id}/delivery-partnership",
    response_model=RestaurantDeliveryPartnershipResponse,
)
def get_restaurant_delivery_partnership(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> RestaurantDeliveryPartnershipResponse:
    return partnership.get_mexy_partnership_status(restaurant.id)


@router.post(
    "/{restaurant_id}/delivery-partnership/request",
    response_model=RestaurantDeliveryPartnershipResponse,
)
def request_restaurant_delivery_partnership(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> RestaurantDeliveryPartnershipResponse:
    return partnership.request_mexy_partnership(
        restaurant.id,
        delivery_enabled=restaurant.delivery_enabled,
    )


@router.get(
    "/{restaurant_id}/delivery-partnership/schedules",
    response_model=list[DeliveryProviderScheduleDTO],
)
def list_active_delivery_provider_schedules(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryProviderScheduleDTO]:
    return partnership.get_active_provider_schedules(restaurant.id)


@router.get(
    "/{restaurant_id}/delivery-partnership/payment-methods",
    response_model=list[DeliveryProviderPaymentMethodDTO],
)
def list_active_delivery_provider_payment_methods(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    partnership: DeliveryPartnershipService = Depends(_partnership_service),
) -> list[DeliveryProviderPaymentMethodDTO]:
    return partnership.get_active_provider_payment_methods(restaurant.id)
