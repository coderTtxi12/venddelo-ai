from app.modules.assistant.chat_attachments import format_user_message_with_attachments
from app.modules.assistant.schemas import ChatAttachmentRef


def test_format_user_message_with_attachments_appends_block():
    attachments = [
        ChatAttachmentRef(
            storage_path="restaurants/abc/import/menu_source/menu.pdf",
            original_name="menu.pdf",
            mime_type="application/pdf",
            kind="menu_source",
            size_bytes=1024,
        )
    ]
    result = format_user_message_with_attachments("Quiero importar mi menú", attachments)
    assert "Quiero importar mi menú" in result
    assert "## Chat attachments" in result
    assert "menu.pdf" in result
    assert "restaurants/abc/import/menu_source/menu.pdf" in result


def test_format_user_message_attachments_only():
    attachments = [
        ChatAttachmentRef(
            storage_path="restaurants/abc/import/menu_source/page.jpg",
            original_name="menu.jpg",
            mime_type="image/jpeg",
            kind="menu_source",
            size_bytes=2048,
        )
    ]
    result = format_user_message_with_attachments("", attachments)
    assert result.startswith("## Chat attachments")
    assert "menu.jpg" in result
