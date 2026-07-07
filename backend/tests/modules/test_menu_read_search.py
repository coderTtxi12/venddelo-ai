from app.modules.assistant.skills.menu_read.search import (
    STRONG_MATCH_THRESHOLD,
    SUGGESTION_THRESHOLD,
    match_score,
    normalize_text,
    tokenize,
)


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


def test_match_score_wings_aliases_to_boneless_product_name():
    score = match_score("Wings & Fries", "BONELESS & FRIES WITC SAUCE")
    assert score >= STRONG_MATCH_THRESHOLD
    assert match_score("Wings & Fries", "BURGER & BONELESS") < STRONG_MATCH_THRESHOLD
