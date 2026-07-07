import uuid

from app.db.models.assistant import AssistantConversation
from app.db.models.restaurant import Restaurant
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.skills.menu_import.tools import MenuImportSkill
from tests.conftest import requires_db


def test_menu_import_skill_registered():
    registry = build_skill_registry()
    assert "menu_import" in registry.registered_skill_ids()
    tools = registry.tool_definitions(["menu_import"])
    names = {tool.name for tool in tools}
    assert "start_menu_import_session" in names
    assert "update_menu_knowledge" in names
    assert len(names) == 13
    assert "optimize_import_draft" in names
    assert "preview_full_import" in names
    assert "apply_full_import" in names
    # Legacy per-section tools are removed so the whole menu applies in one shot.
    assert "apply_menu_batch" not in names
    assert "preview_import_batch" not in names
    assert "request_image_enhancement" not in names


def test_menu_import_skill_exposes_expected_tool_effects():
    skill = MenuImportSkill()
    by_name = {tool.name: tool.effect for tool in skill.tool_definitions()}
    assert by_name["get_import_session"] == "read"
    assert by_name["apply_full_import"] == "mutate"
    assert by_name["update_menu_knowledge"] == "mutate"


@requires_db
def test_start_menu_import_session_creates_session(session):
    restaurant = Restaurant(name="Import Tools", subdomain=f"tools-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()

    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()

    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=conversation.id,
        uow=uow,
        effective_skill_ids=["menu_import"],
    )
    skill = MenuImportSkill()
    result = skill.execute("start_menu_import_session", {}, ctx)

    assert result.ok is True
    assert "Started menu import session" in result.summary
    assert result.data["status"] == "discovery"
    assert result.data["draft_batches_total"] == 0

    active = uow.menu_import_sessions.get_active_for_restaurant(restaurant.id)
    assert active is not None
    assert active.status == "discovery"
    assert active.conversation_id == conversation.id
