from __future__ import annotations

import asyncio
import json
import uuid

from collections.abc import Iterator

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import get_auth, get_current_user, get_synced_user
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryDriver
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.realtime.dispatch_hub import get_dispatch_realtime_hub
from app.infra.realtime.restaurant_dispatch_hub import get_restaurant_dispatch_realtime_hub
from app.infra.realtime.rider_hub import get_rider_realtime_hub
from app.infra.storage.factory import build_storage
from app.modules.delivery_dispatch.schemas import DispatchMonitorSnapshotDTO
from app.modules.delivery_dispatch.service import DeliveryDispatchService
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.users.schemas import UserDTO

router = APIRouter(tags=["delivery-dispatch-realtime"])


def _finish_uow_gen(uow_gen: Iterator[SqlAlchemyUnitOfWork]) -> None:
    try:
        next(uow_gen)
    except StopIteration:
        pass


def _assert_can_read_restaurant_dispatch(
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    user: AuthenticatedUser,
) -> None:
    restaurant = uow.restaurants.get(restaurant_id)
    if restaurant is None:
        raise NotFoundError("Restaurant not found")
    allowed = restaurant.owner_id == user.id
    if not allowed:
        found = uow.restaurants.get_for_user(user.id, restaurant_id=restaurant_id)
        allowed = found is not None and found[1] in ("owner", "admin")
    if not allowed:
        raise ForbiddenError("You do not have access to this restaurant")


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> DeliveryDispatchService:
    return DeliveryDispatchService(
        uow.session,
        SqlAlchemyDeliveryProviderRepository(uow.session),
        build_storage(),
    )


@router.get("/delivery-providers/me/dispatch-monitor", response_model=DispatchMonitorSnapshotDTO)
def get_dispatch_monitor(
    zone_id: str | None = Query(default=None),
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> DispatchMonitorSnapshotDTO:
    parsed_zone_id = None
    if zone_id:
        parsed_zone_id = uuid.UUID(zone_id)
    return service.get_dispatch_monitor(user.id, zone_id=parsed_zone_id)


@router.websocket("/ws/delivery-providers/me/dispatch")
async def dispatch_monitor_ws(
    websocket: WebSocket,
    token: str = Query(...),
    auth: AuthPort = Depends(get_auth),
) -> None:
    if not token.strip():
        await websocket.close(code=4401)
        return

    try:
        user = auth.verify_token(token.strip())
    except UnauthorizedError:
        await websocket.close(code=4401)
        return

    with SqlAlchemyUnitOfWork() as uow:
        found = SqlAlchemyDeliveryProviderRepository(uow.session).get_for_user(user.id)
        if found is None:
            await websocket.close(code=4403)
            return
        provider, _role = found
        provider_id = provider.id

    hub = get_dispatch_realtime_hub()
    await hub.connect(provider_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(provider_id, websocket)


@router.get("/restaurants/{restaurant_id}/dispatch/events")
async def restaurant_dispatch_events(
    request: Request,
    restaurant_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    uow_dep = request.app.dependency_overrides.get(get_uow, get_uow)
    uow_gen = uow_dep()
    uow = next(uow_gen)
    try:
        _assert_can_read_restaurant_dispatch(uow, restaurant_id, user)
    finally:
        _finish_uow_gen(uow_gen)

    hub = get_restaurant_dispatch_realtime_hub()
    queue = hub.subscribe(restaurant_id)

    async def event_generator():
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield (
                    "event: dispatch.updated\n"
                    f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                )
        finally:
            hub.unsubscribe(restaurant_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws/rider/me")
async def rider_me_ws(
    websocket: WebSocket,
    token: str = Query(...),
    auth: AuthPort = Depends(get_auth),
) -> None:
    if not token.strip():
        await websocket.close(code=4401)
        return

    try:
        user = auth.verify_token(token.strip())
    except UnauthorizedError:
        await websocket.close(code=4401)
        return

    with SqlAlchemyUnitOfWork() as uow:
        driver = uow.session.scalar(
            select(DeliveryDriver).where(DeliveryDriver.user_id == user.id)
        )
        if driver is None:
            await websocket.close(code=4403)
            return
        driver_id = driver.id

    hub = get_rider_realtime_hub()
    await hub.connect(driver_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(driver_id, websocket)
