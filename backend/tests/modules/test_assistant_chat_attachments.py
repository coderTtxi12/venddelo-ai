import uuid

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import ValidationError
from app.modules.assistant.import_assets import validate_import_asset_path
from app.modules.assistant.schemas import (
    AssistantConversationChatRequest,
    ChatAttachmentRef,
)


def _sample_attachment(**overrides) -> dict:
    restaurant_id = overrides.pop("restaurant_id", uuid.uuid4())
    defaults = {
        "storage_path": f"restaurants/{restaurant_id}/import/menu_source/menu.pdf",
        "original_name": "menu.pdf",
        "mime_type": "application/pdf",
        "kind": "menu_source",
        "size_bytes": 1024,
    }
    defaults.update(overrides)
    return defaults


def test_chat_request_rejects_empty_message_and_attachments():
    with pytest.raises(PydanticValidationError, match="message or attachments required"):
        AssistantConversationChatRequest(message="   ", profile_version=1)


def test_chat_request_accepts_attachments_without_message():
    restaurant_id = uuid.uuid4()
    body = AssistantConversationChatRequest(
        message="",
        profile_version=1,
        attachments=[ChatAttachmentRef(**_sample_attachment(restaurant_id=restaurant_id))],
    )
    assert body.message == ""
    assert len(body.attachments) == 1


def test_validate_import_asset_path_rejects_wrong_restaurant_prefix():
    restaurant_id = uuid.uuid4()
    other_restaurant_id = uuid.uuid4()
    path = f"restaurants/{other_restaurant_id}/import/menu_source/menu.pdf"

    with pytest.raises(ValidationError, match="Storage path must start with"):
        validate_import_asset_path(restaurant_id, path, kind="menu_source")


def test_chat_attachment_ref_serializes_expected_fields():
    restaurant_id = uuid.uuid4()
    attachment = ChatAttachmentRef(**_sample_attachment(restaurant_id=restaurant_id))

    payload = attachment.model_dump()

    assert payload == {
        "storage_path": f"restaurants/{restaurant_id}/import/menu_source/menu.pdf",
        "original_name": "menu.pdf",
        "mime_type": "application/pdf",
        "kind": "menu_source",
        "size_bytes": 1024,
    }
