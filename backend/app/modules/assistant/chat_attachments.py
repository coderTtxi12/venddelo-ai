"""Format chat file uploads for the LLM tool-calling loop."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.modules.assistant.schemas import ChatAttachmentRef

ATTACHMENTS_SECTION_HEADER = "## Chat attachments"


def format_chat_attachments_block(attachments: list[ChatAttachmentRef]) -> str:
    if not attachments:
        return ""

    lines = [
        ATTACHMENTS_SECTION_HEADER,
        "",
        (
            "The owner uploaded these files before sending this message. "
            "Use each `storage_path` exactly in tools (`register_menu_source_file`, "
            "`assign_product_image`, `match_product_photos`, `bulk_assign_product_images`, etc.). "
            "Do not ask the owner for storage_path — it is already listed below."
        ),
        "",
    ]
    for index, attachment in enumerate(attachments, start=1):
        lines.append(f"{index}. **{attachment.original_name}**")
        lines.append(f"   - storage_path: `{attachment.storage_path}`")
        lines.append(f"   - kind: {attachment.kind}")
        lines.append(f"   - mime_type: {attachment.mime_type}")
    return "\n".join(lines)


def enrich_user_message_with_attachments(
    message: str,
    attachments: list[ChatAttachmentRef],
) -> str:
    block = format_chat_attachments_block(attachments)
    if not block:
        return message
    if ATTACHMENTS_SECTION_HEADER in message:
        return message
    base = message.strip()
    if base:
        return f"{base}\n\n{block}"
    return block


def enrich_user_message_from_metadata(
    message: str,
    metadata: dict[str, Any] | None,
) -> str:
    if not metadata:
        return message
    raw_attachments = metadata.get("attachments")
    if not isinstance(raw_attachments, list) or not raw_attachments:
        return message

    refs: list[ChatAttachmentRef] = []
    for item in raw_attachments:
        if not isinstance(item, dict):
            continue
        try:
            refs.append(ChatAttachmentRef.model_validate(item))
        except ValidationError:
            continue
    return enrich_user_message_with_attachments(message, refs)
