import uuid
from abc import ABC, abstractmethod

from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    id: uuid.UUID
    email: str | None = None
    role: str | None = None


class AuthPort(ABC):
    @abstractmethod
    def verify_token(self, token: str) -> AuthenticatedUser: ...
