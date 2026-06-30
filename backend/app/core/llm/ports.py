from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field

ChatRole = Literal["system", "user", "assistant", "tool"]

ChatStreamEventName = Literal[
    "content.delta",
    "message.complete",
    "error",
    "agent.phase",
    "agent.status",
    "agent.thought",
    "agent.plan",
    "agent.plan_update",
    "agent.skills",
    "tool.start",
    "tool.result",
    "tool.error",
]


class ChatCompletionMessage(BaseModel):
    role: ChatRole
    content: str | None = None
    # OpenAI-format tool calls on assistant messages (passthrough to/from provider).
    tool_calls: list[dict[str, Any]] | None = None
    # Set on ``tool`` role messages to link a result back to the assistant tool call.
    tool_call_id: str | None = None


class ChatCompletionRequest(BaseModel):
    messages: list[ChatCompletionMessage]
    model: str | None = None
    # Omit by default — some models (e.g. gpt-5-nano) only accept the API default.
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: Literal["json_object"] | None = None
    # Native function/tool calling: OpenAI-format tool schemas + choice policy.
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None


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
