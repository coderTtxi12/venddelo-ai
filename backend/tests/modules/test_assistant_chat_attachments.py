from app.modules.assistant.chat_attachments import (
    build_agent_user_request,
    describe_attachments_for_history,
    format_chat_attachments_block,
    format_user_message_with_attachments,
    strip_chat_attachments_block,
)
from app.modules.assistant.schemas import ChatAttachmentRef


def _menu_png_attachment() -> ChatAttachmentRef:
    return ChatAttachmentRef(
        storage_path="restaurants/abc/import/menu_source/menu.png",
        original_name="menu.png",
        mime_type="image/png",
        kind="menu_source",
        size_bytes=3417523,
    )


def test_format_user_message_with_attachments_appends_block():
    attachments = [_menu_png_attachment()]
    result = format_user_message_with_attachments("Quiero importar mi menú", attachments)
    assert "Quiero importar mi menú" in result
    assert "## Chat attachments" in result
    assert "menu.png" in result
    assert "restaurants/abc/import/menu_source/menu.png" in result


def test_format_user_message_attachments_only():
    result = format_user_message_with_attachments("", [_menu_png_attachment()])
    assert result.startswith("## Chat attachments")
    assert "menu.png" in result


def test_strip_chat_attachments_block_keeps_user_text():
    raw = (
        "sube estos esye menu\n\n"
        "## Chat attachments\n\n"
        "- **menu.png** (`menu_source`)\n"
        "  - storage_path: `restaurants/abc/import/menu_source/menu.png`"
    )
    assert strip_chat_attachments_block(raw) == "sube estos esye menu"


def test_strip_chat_attachments_block_summarizes_attachment_only_messages():
    raw = (
        "## Chat attachments\n\n"
        "- **menu.png** (`menu_source`)\n"
        "  - storage_path: `restaurants/abc/import/menu_source/menu.png`"
    )
    assert strip_chat_attachments_block(raw) == "[Adjuntos: menu.png]"


def test_build_agent_user_request_keeps_router_turn_clean_without_attachments():
    assert build_agent_user_request("Hola", None) == "Hola"


def test_describe_attachments_for_history():
    assert describe_attachments_for_history([_menu_png_attachment()]) == "[Adjuntos: menu.png]"


def test_append_attachment_descriptions_combines_user_text_and_summaries():
    from app.modules.assistant.chat_attachments import append_attachment_descriptions

    attachment = ChatAttachmentRef(
        storage_path="restaurants/abc/import/menu_source/menu.png",
        original_name="menu.png",
        mime_type="image/png",
        kind="menu_source",
        size_bytes=10,
    )
    rendered = append_attachment_descriptions(
        "sube este menu",
        [attachment],
        ["Carta de tacos con precios."],
    )

    assert rendered.startswith("sube este menu")
    assert "[Adjunto: menu.png] Carta de tacos con precios." in rendered


def test_format_chat_attachments_block_matches_legacy_shape():
    block = format_chat_attachments_block([_menu_png_attachment()])
    assert block.startswith("## Chat attachments")
    assert "size_bytes: 3417523" in block
