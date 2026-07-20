from __future__ import annotations

import re
import uuid

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    PaymentMethodDTO,
    RestaurantAdminInviteCreate,
    RestaurantAdminInviteDTO,
    RestaurantAccessItem,
    RestaurantAccessListResponse,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantMeResponse,
    RestaurantMemberDTO,
    RestaurantSelectRequest,
    RestaurantUpdate,
    ScheduleCreate,
    ScheduleDTO,
)
from app.modules.restaurants.social_links import (
    is_facebook_url,
    is_instagram_url,
    is_valid_http_url,
    normalize_live_menu_social_placement,
    normalize_social_url,
    whatsapp_contact_url,
)

_ADMIN_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_SUBDOMAIN_RE = re.compile(r"^[a-z0-9](-?[a-z0-9])*$")
_THEME_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DEFAULT_DIGITAL_MENU_THEME_ID = "original"


def _validate_subdomain(subdomain: str) -> None:
    if len(subdomain) < 3 or len(subdomain) > 63:
        raise ValidationError("Subdomain must be 3-63 characters")
    if not _SUBDOMAIN_RE.match(subdomain):
        raise ValidationError("Invalid subdomain format")


def _validate_digital_menu_theme_id(theme_id: str) -> None:
    if len(theme_id) < 1 or len(theme_id) > 64:
        raise ValidationError("digital_menu_theme_id must be 1-64 characters")
    if not _THEME_ID_RE.match(theme_id):
        raise ValidationError("Invalid digital_menu_theme_id format")


def _validate_social_url_field(label: str, url: str | None, *, host_check) -> str | None:
    normalized = normalize_social_url(url)
    if normalized is None:
        return None
    if not is_valid_http_url(normalized):
        raise ValidationError(f"El enlace de {label} no es válido")
    if not host_check(normalized):
        raise ValidationError(f"El enlace de {label} debe ser de {label}")
    return normalized


def _validate_live_menu_social_update(existing: RestaurantDTO, data: RestaurantUpdate) -> RestaurantUpdate:
    enabled = (
        data.live_menu_social_enabled
        if data.live_menu_social_enabled is not None
        else existing.live_menu_social_enabled
    )
    facebook_enabled = (
        data.live_menu_social_facebook_enabled
        if data.live_menu_social_facebook_enabled is not None
        else existing.live_menu_social_facebook_enabled
    )
    instagram_enabled = (
        data.live_menu_social_instagram_enabled
        if data.live_menu_social_instagram_enabled is not None
        else existing.live_menu_social_instagram_enabled
    )
    whatsapp_enabled = (
        data.live_menu_social_whatsapp_enabled
        if data.live_menu_social_whatsapp_enabled is not None
        else existing.live_menu_social_whatsapp_enabled
    )
    facebook_source = (
        data.facebook_url if "facebook_url" in data.model_fields_set else existing.facebook_url
    )
    instagram_source = (
        data.instagram_url if "instagram_url" in data.model_fields_set else existing.instagram_url
    )
    placement_source = (
        data.live_menu_social_placement
        if "live_menu_social_placement" in data.model_fields_set
        else existing.live_menu_social_placement
    )
    placement = normalize_live_menu_social_placement(placement_source)

    normalized_fb = _validate_social_url_field("Facebook", facebook_source, host_check=is_facebook_url)
    normalized_ig = _validate_social_url_field(
        "Instagram", instagram_source, host_check=is_instagram_url
    )
    whatsapp_url = whatsapp_contact_url(existing.whatsapp_phone)

    if facebook_enabled and not normalized_fb:
        raise ValidationError("Agrega un enlace válido de Facebook o desactiva Facebook")
    if instagram_enabled and not normalized_ig:
        raise ValidationError("Agrega un enlace válido de Instagram o desactiva Instagram")
    if whatsapp_enabled and not whatsapp_url:
        raise ValidationError(
            "Configura WhatsApp de pedidos en Configuración o desactiva WhatsApp"
        )

    if enabled:
        has_visible_channel = (
            (facebook_enabled and normalized_fb)
            or (instagram_enabled and normalized_ig)
            or (whatsapp_enabled and whatsapp_url)
        )
        if not has_visible_channel:
            raise ValidationError("Activa al menos una red social con su enlace o WhatsApp configurado")

    patch: dict[str, object] = {}
    if "facebook_url" in data.model_fields_set or normalized_fb != existing.facebook_url:
        patch["facebook_url"] = normalized_fb
    if "instagram_url" in data.model_fields_set or normalized_ig != existing.instagram_url:
        patch["instagram_url"] = normalized_ig
    if (
        "live_menu_social_placement" in data.model_fields_set
        or placement != existing.live_menu_social_placement
    ):
        patch["live_menu_social_placement"] = placement
    if not patch:
        return data
    return data.model_copy(update=patch)


class RestaurantService:
    def __init__(self, repo: RestaurantRepository) -> None:
        self._repo = repo

    def _claim_if_needed(self, user_id: uuid.UUID, email: str | None) -> None:
        if email:
            self._repo.claim_admin_invites(user_id, email)

    def get_me(
        self,
        user_id: uuid.UUID,
        email: str | None = None,
        *,
        restaurant_id: uuid.UUID | None = None,
    ) -> RestaurantMeResponse:
        self._claim_if_needed(user_id, email)
        found = self._repo.get_for_user(user_id, restaurant_id=restaurant_id)
        if found is None:
            return RestaurantMeResponse(restaurant=None, member_role=None)
        restaurant, member_role = found
        self._repo.touch_last_accessed(user_id, restaurant.id)
        return RestaurantMeResponse(restaurant=restaurant, member_role=member_role)

    def list_access(
        self, user_id: uuid.UUID, email: str | None = None
    ) -> RestaurantAccessListResponse:
        self._claim_if_needed(user_id, email)
        return RestaurantAccessListResponse(items=list(self._repo.list_accessible(user_id)))

    def select_restaurant(
        self, user_id: uuid.UUID, data: RestaurantSelectRequest
    ) -> RestaurantMeResponse:
        found = self._repo.get_for_user(user_id, restaurant_id=data.restaurant_id)
        if found is None:
            raise NotFoundError("No tienes acceso a ese restaurante")
        restaurant, member_role = found
        self._repo.touch_last_accessed(user_id, restaurant.id)
        return RestaurantMeResponse(restaurant=restaurant, member_role=member_role)

    def create(self, owner_id: uuid.UUID, data: RestaurantCreate) -> RestaurantDTO:
        if self._repo.user_has_membership(owner_id):
            raise ConflictError("Ya tienes un restaurante asociado")
        _validate_subdomain(data.subdomain)
        if self._repo.get_by_subdomain(data.subdomain):
            raise ConflictError("Subdomain already taken")
        return self._repo.add(data, owner_id=owner_id)

    def get(self, restaurant_id: uuid.UUID) -> RestaurantDTO:
        dto = self._repo.get(restaurant_id)
        if dto is None:
            raise NotFoundError("Restaurant not found")
        return dto

    def list_for_owner(
        self, owner_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[RestaurantDTO]:
        return self._repo.list_for_owner(owner_id, params)

    def update(self, restaurant_id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO:
        if data.digital_menu_theme_id is not None:
            _validate_digital_menu_theme_id(data.digital_menu_theme_id)
        if data.subdomain is not None:
            subdomain = data.subdomain.lower().strip()
            _validate_subdomain(subdomain)
            existing = self._repo.get_by_subdomain(subdomain)
            if existing is not None and existing.id != restaurant_id:
                raise ConflictError("Subdomain already taken")
            data = data.model_copy(update={"subdomain": subdomain})
        social_fields = {
            "live_menu_social_enabled",
            "live_menu_social_facebook_enabled",
            "live_menu_social_instagram_enabled",
            "live_menu_social_whatsapp_enabled",
            "live_menu_social_placement",
            "facebook_url",
            "instagram_url",
        }
        if social_fields.intersection(data.model_fields_set):
            existing_restaurant = self._repo.get(restaurant_id)
            if existing_restaurant is None:
                raise NotFoundError("Restaurant not found")
            data = _validate_live_menu_social_update(existing_restaurant, data)
        dto = self._repo.update(restaurant_id, data)
        if dto is None:
            raise NotFoundError("Restaurant not found")
        return dto

    def check_subdomain_availability(
        self,
        subdomain: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> tuple[str, bool, bool, str | None]:
        """Returns (normalized, available, valid_format, message)."""
        normalized = subdomain.lower().strip()
        try:
            _validate_subdomain(normalized)
        except ValidationError as exc:
            return normalized, False, False, str(exc)
        existing = self._repo.get_by_subdomain(normalized)
        if existing is not None and (exclude_id is None or existing.id != exclude_id):
            return normalized, False, True, "Subdomain already taken"
        return normalized, True, True, None

    def delete(self, restaurant_id: uuid.UUID) -> None:
        if not self._repo.soft_delete(restaurant_id):
            raise NotFoundError("Restaurant not found")

    def set_schedules(self, restaurant_id: uuid.UUID, schedules: list[ScheduleCreate]) -> None:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        self._repo.set_schedules(restaurant_id, schedules)

    def set_payment_methods(
        self, restaurant_id: uuid.UUID, methods: list[PaymentMethodCreate]
    ) -> None:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        self._repo.set_payment_methods(restaurant_id, methods)

    def list_schedules(self, restaurant_id: uuid.UUID) -> list[ScheduleDTO]:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        return list(self._repo.list_schedules(restaurant_id))

    def list_payment_methods(self, restaurant_id: uuid.UUID) -> list[PaymentMethodDTO]:
        if self._repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
        return list(self._repo.list_payment_methods(restaurant_id))

    def list_admin_invites(self, user_id: uuid.UUID) -> list[RestaurantAdminInviteDTO]:
        restaurant_id = self._require_owner_restaurant_id(user_id)
        return list(self._repo.list_admin_invites(restaurant_id))

    def list_admin_members(self, user_id: uuid.UUID) -> list[RestaurantMemberDTO]:
        restaurant_id = self._require_owner_restaurant_id(user_id)
        return list(self._repo.list_admin_members(restaurant_id))

    def add_admin_invite(
        self, user_id: uuid.UUID, data: RestaurantAdminInviteCreate
    ) -> RestaurantAdminInviteDTO:
        restaurant_id = self._require_owner_restaurant_id(user_id)
        normalized = self._normalize_admin_email(data.email)
        if self._repo.email_associated_with_other_restaurant(
            normalized,
            exclude_restaurant_id=restaurant_id,
        ):
            raise ConflictError("Ese correo ya está asociado a otro restaurante")
        if any(
            member.email and member.email.strip().lower() == normalized
            for member in self._repo.list_admin_members(restaurant_id)
        ):
            raise ConflictError("Ese correo ya pertenece al equipo")
        existing = [
            row for row in self._repo.list_admin_invites(restaurant_id) if row.email == normalized
        ]
        if existing:
            raise ConflictError("Ese correo ya está en la lista de administradores")
        return self._repo.add_admin_invite(restaurant_id, normalized)

    def remove_admin_invite(self, user_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        restaurant_id = self._require_owner_restaurant_id(user_id)
        self._repo.remove_admin_invite(restaurant_id, invite_id)

    def remove_admin_member(self, user_id: uuid.UUID, member_id: uuid.UUID) -> None:
        restaurant_id = self._require_owner_restaurant_id(user_id)
        self._repo.remove_admin_member(restaurant_id, member_id)

    def _require_owner_restaurant_id(self, user_id: uuid.UUID) -> uuid.UUID:
        found = self._repo.get_for_user(user_id)
        if found is None:
            raise NotFoundError("No tienes un restaurante asociado")
        restaurant, member_role = found
        if member_role != "owner":
            raise ForbiddenError("Solo el propietario puede administrar invitaciones")
        return restaurant.id

    def _normalize_admin_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if not _ADMIN_EMAIL_RE.match(normalized):
            raise ValidationError("Correo electrónico inválido")
        return normalized
