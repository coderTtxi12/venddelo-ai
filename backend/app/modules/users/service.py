from __future__ import annotations

from app.core.security import AuthenticatedUser
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate, UserDTO, UserProfileUpdate, UserUpdate

_APP_USER_ROLES = frozenset({"owner", "admin", "staff"})


def _default_app_role(role: str | None) -> str:
    if role in _APP_USER_ROLES:
        return role
    return "owner"


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    def get(self, user_id) -> UserDTO | None:
        return self._repo.get(user_id)

    def sync_from_auth(self, auth: AuthenticatedUser) -> UserDTO:
        """Upsert app user profile from Supabase JWT claims."""
        existing = self._repo.get(auth.id)
        if existing is None:
            return self._repo.add(
                UserCreate(
                    id=auth.id,
                    email=auth.email,
                    display_name=auth.display_name,
                    avatar_url=auth.avatar_url,
                    role=_default_app_role(auth.role),
                )
            )

        updates: dict[str, str | None] = {}
        if auth.email and auth.email != existing.email:
            updates["email"] = auth.email
        if auth.display_name and auth.display_name != existing.display_name:
            updates["display_name"] = auth.display_name
        if auth.avatar_url and auth.avatar_url != existing.avatar_url:
            updates["avatar_url"] = auth.avatar_url

        if not updates:
            return existing

        return self._repo.update(auth.id, UserUpdate(**updates)) or existing

    def update_profile(self, user_id, data: UserProfileUpdate) -> UserDTO:
        updated = self._repo.update_profile(user_id, data)
        if updated is None:
            from app.core.exceptions import NotFoundError

            raise NotFoundError("User not found")
        return updated
