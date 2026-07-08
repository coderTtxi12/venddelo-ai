"""Format chat attachment metadata for assistant workflow context."""

from __future__ import annotations

from app.modules.assistant.schemas import ChatAttachmentRef


def format_user_message_with_attachments(
    message: str,
    attachments: list[ChatAttachmentRef],
) -> str:
    """Build the persisted user turn text including the attachment block agents expect."""
    parts: list[str] = []
    cleaned = message.strip()
    if cleaned:
        parts.append(cleaned)
    if attachments:
        lines = ["## Chat attachments", ""]
        for attachment in attachments:
            lines.append(f"- **{attachment.original_name}** (`{attachment.kind}`)")
            lines.append(f"  - storage_path: `{attachment.storage_path}`")
            lines.append(f"  - mime_type: {attachment.mime_type}")
            lines.append(f"  - size_bytes: {attachment.size_bytes}")
            lines.append("")
        parts.append("\n".join(lines).strip())
    combined = "\n\n".join(parts).strip()
    if not combined:
        raise ValueError("message or attachments required")
    return combined
