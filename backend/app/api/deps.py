from __future__ import annotations

import uuid

from fastapi import Depends, Header, Query
from starlette.requests import HTTPConnection

from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, PaginationParams
from app.core.security import AuthenticatedUser, AuthPort
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.restaurants.platform_admin import is_platform_restaurant_admin
from app.modules.restaurants.schemas import RestaurantDTO
from app.modules.users.schemas import UserDTO
from app.modules.users.service import UserService


def get_auth(connection: HTTPConnection) -> AuthPort:
    """Read the process-wide JWT auth from app.state.

    ``HTTPConnection`` is the shared base of HTTP ``Request`` and ``WebSocket``,
    so the same dependency works for REST and realtime handshake.
    """
    auth = getattr(connection.app.state, "auth", None)
    if auth is None:
        raise RuntimeError("Auth not initialized — application lifespan did not run")
    return auth


def get_current_user(
    authorization: str | None = Header(default=None),
    auth: AuthPort = Depends(get_auth),
) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise UnauthorizedError("Missing bearer token")
    return auth.verify_token(token)


def get_synced_user(
    auth: AuthenticatedUser = Depends(get_current_user),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> UserDTO:
    """Verify JWT and upsert the app user profile (Supabase id → users table)."""
    return UserService(uow.users).sync_from_auth(auth)


def pagination_params(
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> PaginationParams:
    return PaginationParams(limit=limit, cursor=cursor)


def require_owned_restaurant(
    restaurant_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> RestaurantDTO:
    restaurant = uow.restaurants.get(restaurant_id)
    if restaurant is None:
        raise NotFoundError("Restaurant not found")
    if restaurant.owner_id == user.id:
        return restaurant
    if is_platform_restaurant_admin(user.email):
        return restaurant
    found = uow.restaurants.get_for_user(
        user.id, restaurant_id=restaurant_id, email=user.email
    )
    if found is not None and found[1] in ("owner", "admin"):
        return restaurant
    raise ForbiddenError("You do not have access to this restaurant")
