import asyncio
from unittest.mock import patch

from app.core.config import Settings
from app.modules.assistant.chat_attachment_describer import describe_chat_attachments
from app.modules.assistant.schemas import ChatAttachmentRef


def test_describe_chat_attachments_uses_vision_for_images():
    attachment = ChatAttachmentRef(
        storage_path="restaurants/abc/import/menu_source/menu.png",
        original_name="menu.png",
        mime_type="image/png",
        kind="menu_source",
        size_bytes=1200,
    )

    with (
        patch(
            "app.modules.assistant.chat_attachment_describer.build_storage",
        ) as storage_factory,
        patch(
            "app.modules.assistant.chat_attachment_describer._describe_attachment_sync",
            return_value="Menú impreso de tacos y bebidas con precios en MXN.",
        ),
    ):
        storage_factory.return_value.read.return_value = b"png"
        descriptions = asyncio.run(
            describe_chat_attachments(
                [attachment],
                settings=Settings(openai_api_key="sk-test"),
            )
        )

    assert descriptions == ["Menú impreso de tacos y bebidas con precios en MXN."]
