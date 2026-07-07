from app.modules.menu.product_status import legacy_product_status


def test_legacy_flags_map_to_active():
    assert (
        legacy_product_status(
            is_published=True,
            approval_status="approved",
            is_active=True,
        )
        == "active"
    )


def test_legacy_flags_map_to_inactive():
    assert (
        legacy_product_status(
            is_published=True,
            approval_status="approved",
            is_active=False,
        )
        == "inactive"
    )


def test_legacy_flags_map_to_draft_when_unpublished():
    assert (
        legacy_product_status(
            is_published=False,
            approval_status="approved",
            is_active=True,
        )
        == "draft"
    )


def test_legacy_flags_map_to_draft_when_not_approved():
    assert (
        legacy_product_status(
            is_published=True,
            approval_status="draft",
            is_active=True,
        )
        == "draft"
    )
