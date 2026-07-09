from app.modules.assistant.skills.menu_import.best_practices_guide import load_menu_best_practices_guide


def test_menu_import_best_practices_guide_loads_from_local_copy():
    guide = load_menu_best_practices_guide()
    assert guide is not None
    assert guide.startswith("# menu_best_practices")
    assert "option_groups" in guide
