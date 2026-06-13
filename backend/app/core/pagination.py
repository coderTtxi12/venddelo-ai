import base64
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class PaginationParams(BaseModel):
    limit: int = DEFAULT_LIMIT
    cursor: str | None = None


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode()


def decode_cursor(cursor: str) -> str:
    return base64.urlsafe_b64decode(cursor.encode()).decode()
