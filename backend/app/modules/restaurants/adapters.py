from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.restaurant import (
    Restaurant,
    RestaurantAdminInvite,
    RestaurantMember,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)
from app.db.models.user import User
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantAdminInviteDTO,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantAccessItem,
    RestaurantMemberDTO,
    RestaurantUpdate,
    ScheduleCreate,
    ScheduleDTO,
)


class SqlAlchemyRestaurantRepository(RestaurantRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: RestaurantCreate, *, owner_id: uuid.UUID | None = None) -> RestaurantDTO:
        obj = Restaurant(owner_id=owner_id, **data.model_dump())
        self._session.add(obj)
        self._session.flush()
        if owner_id is not None:
            self._session.add(
                RestaurantMember(
                    restaurant_id=obj.id,
                    user_id=owner_id,
                    member_role="owner",
                    is_active=True,
                )
            )
            self._session.flush()
        self._session.refresh(obj)
        return RestaurantDTO.model_validate(obj)

    def get(self, id: uuid.UUID) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        return RestaurantDTO.model_validate(obj)

    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None:
        obj = self._session.scalar(
            select(Restaurant).where(
                Restaurant.subdomain == subdomain,
                Restaurant.is_active.is_(True),
            )
        )
        return RestaurantDTO.model_validate(obj) if obj else None

    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]:
        stmt = (
            select(Restaurant)
            .where(Restaurant.is_active.is_(True))
            .order_by(Restaurant.created_at, Restaurant.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Restaurant.created_at, Restaurant.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[RestaurantDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def list_for_owner(
        self, owner_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[RestaurantDTO]:
        stmt = (
            select(Restaurant)
            .where(
                Restaurant.is_active.is_(True),
                Restaurant.owner_id == owner_id,
            )
            .order_by(Restaurant.created_at, Restaurant.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Restaurant.created_at, Restaurant.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[RestaurantDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def list_schedules(self, restaurant_id: uuid.UUID) -> Sequence[ScheduleDTO]:
        rows = self._session.scalars(
            select(RestaurantSchedule).where(RestaurantSchedule.restaurant_id == restaurant_id)
        )
        return [ScheduleDTO.model_validate(r) for r in rows]

    def list_payment_methods(self, restaurant_id: uuid.UUID) -> Sequence[PaymentMethodDTO]:
        rows = self._session.scalars(
            select(RestaurantPaymentMethod).where(
                RestaurantPaymentMethod.restaurant_id == restaurant_id
            )
        )
        return [PaymentMethodDTO.model_validate(r) for r in rows]

    def update(self, id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        return RestaurantDTO.model_validate(obj)

    def soft_delete(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    def set_schedules(self, id: uuid.UUID, schedules: Sequence[ScheduleCreate]) -> None:
        self._session.query(RestaurantSchedule).filter_by(restaurant_id=id).delete()
        for s in schedules:
            self._session.add(RestaurantSchedule(restaurant_id=id, **s.model_dump()))
        self._session.flush()

    def set_payment_methods(self, id: uuid.UUID, methods: Sequence[PaymentMethodCreate]) -> None:
        self._session.query(RestaurantPaymentMethod).filter_by(restaurant_id=id).delete()
        for m in methods:
            self._session.add(RestaurantPaymentMethod(restaurant_id=id, **m.model_dump()))
        self._session.flush()

    def get_for_user(
        self,
        user_id: uuid.UUID,
        *,
        restaurant_id: uuid.UUID | None = None,
    ) -> tuple[RestaurantDTO, str] | None:
        if restaurant_id is not None:
            return self._get_membership_at_restaurant(user_id, restaurant_id)

        owned = self._session.scalar(
            select(Restaurant)
            .where(
                Restaurant.owner_id == user_id,
                Restaurant.is_active.is_(True),
            )
            .order_by(Restaurant.created_at.asc(), Restaurant.id.asc())
        )
        if owned is not None:
            return RestaurantDTO.model_validate(owned), "owner"

        rows = self._session.execute(
            select(Restaurant, RestaurantMember)
            .join(RestaurantMember, RestaurantMember.restaurant_id == Restaurant.id)
            .where(
                RestaurantMember.user_id == user_id,
                RestaurantMember.is_active.is_(True),
                RestaurantMember.member_role == "admin",
                Restaurant.is_active.is_(True),
            )
        ).all()
        if not rows:
            return None

        with_last_access = [
            (restaurant, member)
            for restaurant, member in rows
            if member.last_accessed_at is not None
        ]
        if with_last_access:
            restaurant, member = max(
                with_last_access,
                key=lambda item: item[1].last_accessed_at or datetime.min.replace(tzinfo=UTC),
            )
            return RestaurantDTO.model_validate(restaurant), member.member_role

        restaurant, member = min(rows, key=lambda item: item[1].created_at)
        return RestaurantDTO.model_validate(restaurant), member.member_role

    def _get_membership_at_restaurant(
        self,
        user_id: uuid.UUID,
        restaurant_id: uuid.UUID,
    ) -> tuple[RestaurantDTO, str] | None:
        restaurant = self._session.scalar(
            select(Restaurant).where(
                Restaurant.id == restaurant_id,
                Restaurant.is_active.is_(True),
            )
        )
        if restaurant is None:
            return None
        if restaurant.owner_id == user_id:
            return RestaurantDTO.model_validate(restaurant), "owner"

        member = self._session.scalar(
            select(RestaurantMember).where(
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.user_id == user_id,
                RestaurantMember.is_active.is_(True),
            )
        )
        if member is None:
            return None
        return RestaurantDTO.model_validate(restaurant), member.member_role

    def list_accessible(self, user_id: uuid.UUID) -> Sequence[RestaurantAccessItem]:
        items: list[RestaurantAccessItem] = []
        seen_restaurant_ids: set[uuid.UUID] = set()

        owned_rows = self._session.scalars(
            select(Restaurant)
            .where(
                Restaurant.owner_id == user_id,
                Restaurant.is_active.is_(True),
            )
            .order_by(Restaurant.created_at.asc(), Restaurant.id.asc())
        ).all()
        for restaurant in owned_rows:
            self._ensure_owner_member(restaurant.id, user_id)
            member = self._session.scalar(
                select(RestaurantMember).where(
                    RestaurantMember.restaurant_id == restaurant.id,
                    RestaurantMember.user_id == user_id,
                    RestaurantMember.is_active.is_(True),
                )
            )
            if member is None:
                continue
            items.append(
                RestaurantAccessItem(
                    restaurant=RestaurantDTO.model_validate(restaurant),
                    member_role="owner",
                    member_id=member.id,
                    last_accessed_at=member.last_accessed_at,
                )
            )
            seen_restaurant_ids.add(restaurant.id)

        admin_rows = self._session.execute(
            select(Restaurant, RestaurantMember)
            .join(RestaurantMember, RestaurantMember.restaurant_id == Restaurant.id)
            .where(
                RestaurantMember.user_id == user_id,
                RestaurantMember.is_active.is_(True),
                RestaurantMember.member_role == "admin",
                Restaurant.is_active.is_(True),
            )
            .order_by(
                RestaurantMember.last_accessed_at.desc().nullslast(),
                RestaurantMember.created_at.asc(),
            )
        ).all()
        for restaurant, member in admin_rows:
            if restaurant.id in seen_restaurant_ids:
                continue
            items.append(
                RestaurantAccessItem(
                    restaurant=RestaurantDTO.model_validate(restaurant),
                    member_role="admin",
                    member_id=member.id,
                    last_accessed_at=member.last_accessed_at,
                )
            )
        return items

    def touch_last_accessed(self, user_id: uuid.UUID, restaurant_id: uuid.UUID) -> None:
        member = self._session.scalar(
            select(RestaurantMember).where(
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.user_id == user_id,
                RestaurantMember.is_active.is_(True),
            )
        )
        if member is None:
            owned = self._session.scalar(
                select(Restaurant.id).where(
                    Restaurant.id == restaurant_id,
                    Restaurant.owner_id == user_id,
                    Restaurant.is_active.is_(True),
                )
            )
            if owned is None:
                return
            self._ensure_owner_member(restaurant_id, user_id)
            member = self._session.scalar(
                select(RestaurantMember).where(
                    RestaurantMember.restaurant_id == restaurant_id,
                    RestaurantMember.user_id == user_id,
                    RestaurantMember.is_active.is_(True),
                )
            )
        if member is None:
            return
        member.last_accessed_at = datetime.now(UTC)
        self._session.flush()

    def remove_admin_member(self, restaurant_id: uuid.UUID, member_id: uuid.UUID) -> None:
        from app.core.exceptions import NotFoundError, ValidationError

        member = self._session.scalar(
            select(RestaurantMember).where(
                RestaurantMember.id == member_id,
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.is_active.is_(True),
            )
        )
        if member is None:
            raise NotFoundError("Administrador no encontrado")
        if member.member_role != "admin":
            raise ValidationError("No puedes eliminar al propietario")
        member.is_active = False
        self._session.flush()

    def _ensure_owner_member(self, restaurant_id: uuid.UUID, user_id: uuid.UUID) -> None:
        existing = self._session.scalar(
            select(RestaurantMember.id).where(
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.user_id == user_id,
            )
        )
        if existing is not None:
            return
        self._session.add(
            RestaurantMember(
                restaurant_id=restaurant_id,
                user_id=user_id,
                member_role="owner",
                is_active=True,
            )
        )
        self._session.flush()

    def user_has_membership(self, user_id: uuid.UUID) -> bool:
        found = self._session.scalar(
            select(RestaurantMember.id).where(
                RestaurantMember.user_id == user_id,
                RestaurantMember.is_active.is_(True),
            )
        )
        if found is not None:
            return True
        return (
            self._session.scalar(
                select(Restaurant.id).where(
                    Restaurant.owner_id == user_id,
                    Restaurant.is_active.is_(True),
                )
            )
            is not None
        )

    def email_associated_with_other_restaurant(
        self,
        email: str,
        *,
        exclude_restaurant_id: uuid.UUID | None = None,
    ) -> bool:
        normalized = email.strip().lower()
        invite_stmt = select(RestaurantAdminInvite.id).where(
            RestaurantAdminInvite.email == normalized
        )
        if exclude_restaurant_id is not None:
            invite_stmt = invite_stmt.where(
                RestaurantAdminInvite.restaurant_id != exclude_restaurant_id
            )
        if self._session.scalar(invite_stmt.limit(1)) is not None:
            return True

        owner_stmt = (
            select(Restaurant.id)
            .join(User, User.id == Restaurant.owner_id)
            .where(
                User.email == normalized,
                Restaurant.is_active.is_(True),
            )
        )
        if exclude_restaurant_id is not None:
            owner_stmt = owner_stmt.where(Restaurant.id != exclude_restaurant_id)
        return self._session.scalar(owner_stmt.limit(1)) is not None

    def list_admin_members(
        self, restaurant_id: uuid.UUID
    ) -> Sequence[RestaurantMemberDTO]:
        rows = self._session.execute(
            select(
                RestaurantMember,
                User.email,
                User.display_name,
            )
            .join(User, User.id == RestaurantMember.user_id)
            .where(
                RestaurantMember.restaurant_id == restaurant_id,
                RestaurantMember.is_active.is_(True),
                RestaurantMember.member_role.in_(("owner", "admin")),
            )
            .order_by(
                RestaurantMember.member_role.desc(),
                RestaurantMember.created_at.asc(),
            )
        ).all()
        return [
            RestaurantMemberDTO(
                id=member.id,
                user_id=member.user_id,
                email=email,
                display_name=display_name,
                member_role=member.member_role,
                created_at=member.created_at,
            )
            for member, email, display_name in rows
        ]

    def list_admin_invites(
        self, restaurant_id: uuid.UUID
    ) -> Sequence[RestaurantAdminInviteDTO]:
        rows = self._session.scalars(
            select(RestaurantAdminInvite)
            .where(RestaurantAdminInvite.restaurant_id == restaurant_id)
            .order_by(RestaurantAdminInvite.created_at.asc())
        ).all()
        return [RestaurantAdminInviteDTO.model_validate(row) for row in rows]

    def add_admin_invite(
        self, restaurant_id: uuid.UUID, email: str
    ) -> RestaurantAdminInviteDTO:
        invite = RestaurantAdminInvite(
            restaurant_id=restaurant_id,
            email=email,
        )
        self._session.add(invite)
        self._session.flush()
        return RestaurantAdminInviteDTO.model_validate(invite)

    def remove_admin_invite(self, restaurant_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        invite = self._session.scalar(
            select(RestaurantAdminInvite).where(
                RestaurantAdminInvite.id == invite_id,
                RestaurantAdminInvite.restaurant_id == restaurant_id,
            )
        )
        if invite is None:
            from app.core.exceptions import NotFoundError

            raise NotFoundError("Invitación no encontrada")
        self._session.delete(invite)

    def claim_admin_invites(self, user_id: uuid.UUID, email: str) -> bool:
        normalized = email.strip().lower()
        if not normalized:
            return False

        invites = self._session.scalars(
            select(RestaurantAdminInvite)
            .where(RestaurantAdminInvite.email == normalized)
            .order_by(RestaurantAdminInvite.created_at.asc())
        ).all()
        if not invites:
            return False

        claimed = False
        for invite in invites:
            existing = self._session.scalar(
                select(RestaurantMember).where(
                    RestaurantMember.restaurant_id == invite.restaurant_id,
                    RestaurantMember.user_id == user_id,
                )
            )
            if existing is None:
                self._session.add(
                    RestaurantMember(
                        restaurant_id=invite.restaurant_id,
                        user_id=user_id,
                        member_role="admin",
                        is_active=True,
                    )
                )
                claimed = True
            elif not existing.is_active:
                existing.is_active = True
                existing.member_role = "admin"
                claimed = True
            self._session.delete(invite)

        if claimed:
            self._session.flush()
        elif invites:
            self._session.flush()
        return claimed
