import base64
import uuid
from datetime import datetime
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
    total: int | None = None


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode()


def decode_cursor(cursor: str) -> str:
    return base64.urlsafe_b64decode(cursor.encode()).decode()


def encode_keyset_cursor(created_at: datetime, id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_keyset_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    created_at_str, id_str = raw.split("|", 1)
    return datetime.fromisoformat(created_at_str), uuid.UUID(id_str)


def encode_sort_keyset_cursor(sort: str, value: str, id: uuid.UUID) -> str:
    raw = f"{sort}|{value}|{id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_sort_keyset_cursor(cursor: str) -> tuple[str, str, uuid.UUID]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    sort, value, id_str = raw.split("|", 2)
    return sort, value, uuid.UUID(id_str)
