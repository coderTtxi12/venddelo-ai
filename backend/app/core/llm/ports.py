from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field

ChatRole = Literal["system", "user", "assistant"]


class ChatCompletionMessage(BaseModel):
    role: ChatRole
    content: str


class ChatCompletionRequest(BaseModel):
    messages: list[ChatCompletionMessage]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int | None = None


class ChatStreamEvent(BaseModel):
    event: Literal["content.delta", "message.complete", "error"]
    data: dict[str, Any] = Field(default_factory=dict)


class LLMProviderPort(ABC):
    @abstractmethod
    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]: ...
