from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.api.deps import get_auth, get_synced_user
from app.core.exceptions import UnauthorizedError
from app.core.security import AuthPort
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


@router.websocket("/ws/restaurants/{restaurant_id}/dispatch")
async def restaurant_dispatch_ws(
    websocket: WebSocket,
    restaurant_id: uuid.UUID,
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
        restaurant = uow.restaurants.get(restaurant_id)
        if restaurant is None:
            await websocket.close(code=4404)
            return
        allowed = restaurant.owner_id == user.id
        if not allowed:
            found = uow.restaurants.get_for_user(user.id, restaurant_id=restaurant_id)
            allowed = found is not None and found[1] in ("owner", "admin")
        if not allowed:
            await websocket.close(code=4403)
            return

    hub = get_restaurant_dispatch_realtime_hub()
    await hub.connect(restaurant_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(restaurant_id, websocket)


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
