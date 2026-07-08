from pathlib import Path


def test_menu_import_skill_md_concierge_workflow():
    text = Path("app/modules/assistant/skills/menu_import/SKILL.md").read_text()
    assert "load_skill(menu_write)" in text
    assert "load_skill(menu_best_practices)" in text
    assert "optimize_import_draft" in text
    assert "preview_full_import" in text
    assert "apply_full_import" in text
    assert "Never during import" in text
    assert "generate_product_image" in text
    assert "Complement detection" in text
    # Concierge must investigate the current menu and reconcile before applying.
    assert "load_skill(menu_read)" in text
    assert "Investigate" in text
    assert "reconcile" in text
    assert "run_menu_import_onboarding" in text
    assert "analyze_import_vs_live" in text
    assert "one message" in text or "one batch" in text or "de jalón" in text.lower()


def test_menu_import_skill_md_no_menu_media_in_workflow():
    text = Path("app/modules/assistant/skills/menu_import/SKILL.md").read_text()
    workflow = text.split("## Workflow")[1].split("## Complement")[0]
    assert "menu_media" not in workflow
    assert "request_image_enhancement" not in workflow
