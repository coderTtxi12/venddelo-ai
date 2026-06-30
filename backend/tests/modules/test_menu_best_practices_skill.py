from app.modules.assistant.skills.markdown import load_skill_guide
from app.modules.assistant.skills.menu_best_practices.tools import MenuBestPracticesSkill
from app.modules.assistant.skills.registry import SkillRegistry


def test_menu_best_practices_has_no_tools():
    skill = MenuBestPracticesSkill()
    assert skill.id == "menu_best_practices"
    assert skill.tool_definitions() == []


def test_menu_best_practices_guide_loads_from_skill_md():
    guide = load_skill_guide("menu_best_practices")
    assert guide is not None
    assert guide.startswith("# menu_best_practices")
    assert "Venddelo" in guide
    assert "option_groups" in guide


def test_registry_loads_guide_without_tools():
    registry = SkillRegistry([MenuBestPracticesSkill()])
    sections = registry.system_prompt_sections(["menu_best_practices"])
    assert len(sections) == 1
    assert registry.tool_definitions(["menu_best_practices"]) == []
