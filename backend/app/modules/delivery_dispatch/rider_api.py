from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status

from app.api.deps import get_synced_user
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.delivery_dispatch.schemas import (
    DeliveryTaskPayload,
    RiderAssignmentDTO,
    RiderFcmTokenUpdate,
    RiderLocationUpdate,
    RiderOfferDTO,
    RiderOnlineUpdate,
    RiderProfileDTO,
)
from app.modules.delivery_dispatch.service import RiderDispatchService
from app.modules.delivery_dispatch.tasks import authorize_internal_task, handle_task
from app.modules.users.schemas import UserDTO

rider_router = APIRouter(prefix="/rider", tags=["rider"])
internal_router = APIRouter(prefix="/internal/delivery", tags=["delivery-tasks"])


def _rider_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> RiderDispatchService:
    return RiderDispatchService(uow.session)


@rider_router.get("/me", response_model=RiderProfileDTO)
def get_rider_me(
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderProfileDTO:
    return service.get_me(user)


@rider_router.patch("/me/online", response_model=RiderProfileDTO)
def patch_rider_online(
    data: RiderOnlineUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderProfileDTO:
    return service.set_online(user, data.is_online)


@rider_router.post("/me/location", response_model=RiderProfileDTO)
def post_rider_location(
    data: RiderLocationUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderProfileDTO:
    return service.update_location(user, data.latitude, data.longitude)


@rider_router.get("/me/offers", response_model=list[RiderOfferDTO])
def list_rider_offers(
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> list[RiderOfferDTO]:
    return service.list_offers(user)


@rider_router.post("/me/offers/{offer_id}/accept", response_model=RiderOfferDTO)
def accept_rider_offer(
    offer_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderOfferDTO:
    return service.accept_offer(user, offer_id)


@rider_router.post("/me/offers/{offer_id}/reject", response_model=RiderOfferDTO)
def reject_rider_offer(
    offer_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderOfferDTO:
    return service.reject_offer(user, offer_id)


@rider_router.put("/me/fcm-token", response_model=RiderProfileDTO)
def put_rider_fcm_token(
    data: RiderFcmTokenUpdate,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderProfileDTO:
    return service.set_fcm_token(user, data.fcm_token)


@rider_router.post(
    "/me/assignments/{request_id}/picked-up",
    response_model=RiderAssignmentDTO,
)
def post_rider_picked_up(
    request_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderAssignmentDTO:
    return service.transition_assignment(user, request_id, "picked_up")


@rider_router.post(
    "/me/assignments/{request_id}/in-transit",
    response_model=RiderAssignmentDTO,
)
def post_rider_in_transit(
    request_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderAssignmentDTO:
    return service.transition_assignment(user, request_id, "in_transit")


@rider_router.post(
    "/me/assignments/{request_id}/delivered",
    response_model=RiderAssignmentDTO,
)
def post_rider_delivered(
    request_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: RiderDispatchService = Depends(_rider_service),
) -> RiderAssignmentDTO:
    return service.transition_assignment(user, request_id, "delivered")


@internal_router.post(
    "/tasks",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
def post_internal_delivery_task(
    data: DeliveryTaskPayload,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    x_delivery_tasks_secret: Annotated[str | None, Header()] = None,
) -> Response:
    authorize_internal_task(x_delivery_tasks_secret)
    handle_task(uow.session, data.model_dump(mode="json"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
