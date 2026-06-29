from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from datetime import UTC, datetime
import uuid


def test_compose_system_prompt_includes_display_name():
    record = AssistantProfileRecord(
        restaurant_id=uuid.uuid4(),
        display_name="Luna",
        identity_markdown="# Identity",
        behavior_markdown="# Behavior",
        menu_markdown="# Menu rules",
        enabled_skill_ids=["menu_read"],
        version=1,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    prompt = compose_system_prompt(record, effective_skill_ids=["menu_read"])
    assert 'Your assistant display name is "Luna"' in prompt
    assert "Tu nombre es" not in prompt
    assert "Respond in Spanish" in prompt
    assert "# Identity" in prompt
    assert "menu_read" in prompt
    assert "# Menu rules" in prompt
