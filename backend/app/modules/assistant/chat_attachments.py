"""Format chat attachment metadata for assistant workflow context."""

from __future__ import annotations

import re

from app.modules.assistant.schemas import ChatAttachmentRef

CHAT_ATTACHMENTS_HEADER = "## Chat attachments"
_ATTACHMENT_NAME_PATTERN = re.compile(r"\*\*([^*]+)\*\*")


def format_chat_attachments_block(attachments: list[ChatAttachmentRef]) -> str:
    if not attachments:
        return ""
    lines = [CHAT_ATTACHMENTS_HEADER, ""]
    for attachment in attachments:
        lines.append(f"- **{attachment.original_name}** (`{attachment.kind}`)")
        lines.append(f"  - storage_path: `{attachment.storage_path}`")
        lines.append(f"  - mime_type: {attachment.mime_type}")
        lines.append(f"  - size_bytes: {attachment.size_bytes}")
        lines.append("")
    return "\n".join(lines).strip()


def format_attachment_descriptions_block(
    attachments: list[ChatAttachmentRef],
    descriptions: list[str],
) -> str:
    if not attachments:
        return ""
    lines: list[str] = []
    for attachment, description in zip(attachments, descriptions, strict=True):
        name = attachment.original_name.strip() or "archivo"
        summary = description.strip() or "sin descripción"
        lines.append(f"[Adjunto: {name}] {summary}")
    return "\n\n".join(lines)


def append_attachment_descriptions(
    user_message: str,
    attachments: list[ChatAttachmentRef],
    descriptions: list[str],
) -> str:
    description_block = format_attachment_descriptions_block(attachments, descriptions)
    cleaned = user_message.strip()
    if cleaned and description_block:
        return f"{cleaned}\n\n{description_block}"
    if description_block:
        return description_block
    return cleaned


def describe_attachments_for_history(attachments: list[ChatAttachmentRef]) -> str:
    if not attachments:
        return ""
    names = ", ".join(attachment.original_name for attachment in attachments)
    return f"[Adjuntos: {names}]"


def strip_chat_attachments_block(text: str) -> str:
    """Remove technical attachment metadata from persisted/history messages."""
    if CHAT_ATTACHMENTS_HEADER not in text:
        return text.strip()
    before, block = text.split(CHAT_ATTACHMENTS_HEADER, 1)
    cleaned = before.strip()
    if cleaned:
        return cleaned
    names = _ATTACHMENT_NAME_PATTERN.findall(block)
    if names:
        return f"[Adjuntos: {', '.join(names)}]"
    return "[Archivo adjunto]"


def build_agent_user_request(
    user_message: str,
    attachments_context: str | None,
) -> str:
    cleaned = user_message.strip()
    block = (attachments_context or "").strip()
    if cleaned and block:
        return f"{cleaned}\n\n{block}"
    if block:
        return block
    return cleaned


def format_user_message_with_attachments(
    message: str,
    attachments: list[ChatAttachmentRef],
) -> str:
    """Build agent turn text with attachment metadata (current turn only)."""
    return build_agent_user_request(
        message.strip(),
        format_chat_attachments_block(attachments),
    )
