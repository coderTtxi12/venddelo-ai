from app.modules.assistant.skills import build_skill_registry
from app.modules.assistant.skills.discovery import discover_skill_executors
from app.modules.assistant.skills.markdown import (
    load_skill_guide,
    load_skill_metadata,
    parse_frontmatter,
    skill_class_name,
)


def test_parse_frontmatter_splits_metadata_and_body():
    raw = "---\nname: demo\ndescription: Demo skill\n---\n\n# Body\n"
    metadata, body = parse_frontmatter(raw)
    assert metadata["name"] == "demo"
    assert metadata["description"] == "Demo skill"
    assert body.startswith("# Body")


def test_parse_frontmatter_without_frontmatter():
    raw = "# Title\n\nContent"
    metadata, body = parse_frontmatter(raw)
    assert metadata == {}
    assert body == raw


def test_menu_read_metadata_and_guide():
    metadata = load_skill_metadata("menu_read")
    assert metadata["name"] == "menu_read"
    assert "Read-only" in metadata["description"]

    guide = load_skill_guide("menu_read")
    assert guide is not None
    assert guide.startswith("# menu_read")
    assert "---" not in guide.splitlines()[0]


def test_skill_class_name_convention():
    assert skill_class_name("menu_read") == "MenuReadSkill"


def test_discover_skill_executors_includes_menu_read():
    executors = discover_skill_executors()
    ids = {skill.id for skill in executors}
    assert "menu_read" in ids
    assert "menu_write" in ids
    assert "menu_best_practices" in ids


def test_menu_write_exposes_mutate_tools():
    registry = build_skill_registry()
    tools = registry.tool_definitions(["menu_write"])
    names = {tool.name for tool in tools}
    assert "create_category" in names
    assert "update_product" in names
    assert all(tool.effect == "mutate" for tool in tools)
    guide = load_skill_guide("menu_write")
    assert guide is not None
    assert "create_category" in guide


def test_build_skill_registry_discovers_menu_read_tools():
    registry = build_skill_registry()
    tools = registry.tool_definitions(["menu_read"])
    names = {tool.name for tool in tools}
    assert "search_products" in names
    assert "list_categories" in names
