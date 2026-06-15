from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.modules.users.schemas import UserCreate, UserDTO, UserProfileUpdate, UserUpdate


class UserRepository(ABC):
    @abstractmethod
    def get(self, user_id: uuid.UUID) -> UserDTO | None: ...

    @abstractmethod
    def add(self, data: UserCreate) -> UserDTO: ...

    @abstractmethod
    def update(self, user_id: uuid.UUID, data: UserUpdate) -> UserDTO | None: ...

    @abstractmethod
    def update_profile(self, user_id: uuid.UUID, data: UserProfileUpdate) -> UserDTO | None: ...
