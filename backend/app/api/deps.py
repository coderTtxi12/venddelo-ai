from __future__ import annotations

import uuid

from fastapi import Depends, Header, Query

from app.core.config import Settings, get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, PaginationParams
from app.core.security import AuthenticatedUser, AuthPort
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.auth.supabase_jwt import SupabaseJwtAuth
from app.modules.restaurants.schemas import RestaurantDTO


def get_auth(settings: Settings = Depends(get_settings)) -> AuthPort:
    return SupabaseJwtAuth(settings)


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
    if restaurant.owner_id is None or restaurant.owner_id != user.id:
        raise ForbiddenError("You do not own this restaurant")
    return restaurant
