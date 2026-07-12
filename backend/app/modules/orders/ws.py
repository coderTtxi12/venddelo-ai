from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.api.deps import get_auth
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import AuthPort
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.realtime.order_hub import get_order_realtime_hub

router = APIRouter(tags=["orders-realtime"])


@router.websocket("/ws/restaurants/{restaurant_id}/orders")
async def orders_kitchen_ws(
    websocket: WebSocket,
    restaurant_id: uuid.UUID,
    token: str = Query(...),
    auth: AuthPort = Depends(get_auth),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    if not token.strip():
        await websocket.close(code=4401)
        return

    try:
        user = auth.verify_token(token.strip())
    except UnauthorizedError:
        await websocket.close(code=4401)
        return

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

    hub = get_order_realtime_hub()
    await hub.connect(restaurant_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(restaurant_id, websocket)
