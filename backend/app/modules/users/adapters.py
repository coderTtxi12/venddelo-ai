from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models.user import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate, UserDTO, UserProfileUpdate, UserUpdate


class SqlAlchemyUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, user_id: uuid.UUID) -> UserDTO | None:
        obj = self._session.get(User, user_id)
        return UserDTO.model_validate(obj) if obj else None

    def add(self, data: UserCreate) -> UserDTO:
        obj = User(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return UserDTO.model_validate(obj)

    def update(self, user_id: uuid.UUID, data: UserUpdate) -> UserDTO | None:
        obj = self._session.get(User, user_id)
        if obj is None:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        return UserDTO.model_validate(obj)

    def update_profile(self, user_id: uuid.UUID, data: UserProfileUpdate) -> UserDTO | None:
        return self.update(user_id, UserUpdate(**data.model_dump(exclude_unset=True)))
