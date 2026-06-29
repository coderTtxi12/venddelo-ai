from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field

ChatRole = Literal["system", "user", "assistant"]

ChatStreamEventName = Literal[
    "content.delta",
    "message.complete",
    "error",
    "agent.phase",
    "agent.status",
    "tool.start",
    "tool.result",
    "tool.error",
]


class ChatCompletionMessage(BaseModel):
    role: ChatRole
    content: str


class ChatCompletionRequest(BaseModel):
    messages: list[ChatCompletionMessage]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int | None = None
    response_format: Literal["json_object"] | None = None


class ChatStreamEvent(BaseModel):
    event: ChatStreamEventName
    data: dict[str, Any] = Field(default_factory=dict)


class LLMUsageRecord(BaseModel):
    provider: str
    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)


class LLMProviderPort(ABC):
    @abstractmethod
    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]: ...
