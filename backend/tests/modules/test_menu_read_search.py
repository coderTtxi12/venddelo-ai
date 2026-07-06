from datetime import UTC, datetime
import uuid

from app.modules.assistant.skills.menu_read.search import (
    STRONG_MATCH_THRESHOLD,
    SUGGESTION_THRESHOLD,
    match_score,
    normalize_text,
    tokenize,
)
from app.modules.assistant.skills.menu_read.tools import _live_menu_status, _live_menu_status_counts
from app.modules.menu.schemas import ProductDTO


def _product_dto(**overrides) -> ProductDTO:
    base = {
        "id": uuid.uuid4(),
        "restaurant_id": uuid.uuid4(),
        "name": "Test",
        "price_cents": 1000,
        "currency": "MXN",
        "approval_status": "draft",
        "is_published": False,
        "is_active": True,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
    base.update(overrides)
    return ProductDTO(**base)


def test_live_menu_status_draft_when_unpublished_or_not_approved():
    assert _live_menu_status(_product_dto()) == "draft"
    assert (
        _live_menu_status(
            _product_dto(is_published=True, approval_status="draft", is_active=True)
        )
        == "draft"
    )
    assert (
        _live_menu_status(
            _product_dto(is_published=False, approval_status="approved", is_active=True)
        )
        == "draft"
    )


def test_live_menu_status_en_menu_and_inactivo_when_published_approved():
    assert (
        _live_menu_status(
            _product_dto(is_published=True, approval_status="approved", is_active=True)
        )
        == "en_menu"
    )
    assert (
        _live_menu_status(
            _product_dto(is_published=True, approval_status="approved", is_active=False)
        )
        == "inactivo"
    )


def test_live_menu_status_counts_groups_owner_states():
    products = [
        _product_dto(is_published=True, approval_status="approved", is_active=True),
        _product_dto(is_published=True, approval_status="approved", is_active=True),
        _product_dto(is_published=True, approval_status="draft", is_active=True),
        _product_dto(is_published=True, approval_status="approved", is_active=False),
    ]
    assert _live_menu_status_counts(products) == {
        "en_menu": 2,
        "inactivo": 1,
        "draft": 1,
    }


def test_normalize_strips_accents_and_case():
    assert normalize_text("Limón") == "limon"
    assert normalize_text("  WINGS & FRIES ") == "wings & fries"


def test_tokenize_splits_on_separators():
    assert tokenize("WINGS & FRIES") == ["wings", "fries"]
    assert tokenize("Coca-Cola/Light") == ["coca", "cola", "light"]


def test_match_score_exact_substring_is_one():
    assert match_score("pastor", "Taco al pastor") == 1.0


def test_match_score_ignores_accents():
    assert match_score("limon", "Limón") == 1.0


def test_match_score_tolerates_typos():
    # "wins" -> "wings" and "frice" -> "fries" should be strong matches.
    assert match_score("wins", "WINGS & FRIES") >= STRONG_MATCH_THRESHOLD
    assert match_score("frice", "WINGS & FRIES") >= STRONG_MATCH_THRESHOLD
    assert match_score("wins and fries", "WINGS & FRIES") >= STRONG_MATCH_THRESHOLD


def test_match_score_other_language_is_below_suggestion():
    # Cross-language is intentionally out of scope (handled via list_products fallback).
    assert match_score("alitas", "WINGS & FRIES") < SUGGESTION_THRESHOLD


def test_match_score_unrelated_is_low():
    assert match_score("pizza", "WINGS & FRIES") < SUGGESTION_THRESHOLD


def test_match_score_single_shared_token_does_not_dominate():
    # A multi-word query must not strongly match a product that shares only one token.
    score = match_score("BONELESS & FRIES WITC SAUCE", "BURGER & BONELESS")
    assert score < STRONG_MATCH_THRESHOLD


def test_match_score_prefers_the_correct_product():
    query = "BONELESS & FRIES WITC SAUCE"
    correct = match_score(query, "BONELESS & FRIES WITC SAUCE")
    wrong = match_score(query, "BURGER & BONELESS")
    assert correct == 1.0
    assert correct > wrong
    assert wrong < STRONG_MATCH_THRESHOLD
