"""Fuzzy, accent-insensitive product matching for the menu_read skill.

Pure functions (no DB) so they can be unit-tested in isolation. Uses the stdlib
``difflib`` ratio plus token-level comparison to tolerate typos ("wins" -> "wings"),
plurals, and accents ("limon" -> "limón"). Cross-language matching ("alitas" ->
"wings") is intentionally out of scope here — the agent handles that by falling back
to ``list_products`` and translating (see SKILL.md).
"""

from __future__ import annotations

import unicodedata
from difflib import SequenceMatcher

# Products at/above this score are returned as confident matches.
STRONG_MATCH_THRESHOLD = 0.7
# Products between this and STRONG are returned as "did you mean" suggestions.
SUGGESTION_THRESHOLD = 0.5

_SPLIT_CHARS = "&/,.-+_()[]{}|:;"

# Filler words that should not anchor a match on their own.
_STOPWORDS = frozenset(
    {"and", "or", "y", "o", "con", "de", "del", "la", "el", "los", "las", "the", "a", "an", "en"}
)

# How much the query-token coverage vs. whole-string ratio contribute to the score.
_COVERAGE_WEIGHT = 0.8
_SEQUENCE_WEIGHT = 0.2


def normalize_text(text: str) -> str:
    """Lowercase and strip accents/diacritics for comparison."""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return stripped.casefold().strip()


def tokenize(text: str) -> list[str]:
    """Split normalized text into alphanumeric tokens (handles ``&``, ``/``, etc.)."""
    normalized = normalize_text(text)
    for char in _SPLIT_CHARS:
        normalized = normalized.replace(char, " ")
    return [token for token in normalized.split() if token]


def _meaningful_tokens(tokens: list[str]) -> list[str]:
    filtered = [token for token in tokens if len(token) > 1 and token not in _STOPWORDS]
    return filtered or tokens


def _token_similarity(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.9
    return SequenceMatcher(None, a, b).ratio()


def _query_coverage(query_tokens: list[str], text_tokens: list[str]) -> float:
    """Average best per-query-token similarity (how much of the query the text covers)."""
    if not query_tokens or not text_tokens:
        return 0.0
    total = sum(
        max(_token_similarity(qt, tt) for tt in text_tokens) for qt in query_tokens
    )
    return total / len(query_tokens)


def match_score(query: str, *texts: str) -> float:
    """Best similarity (0..1) between ``query`` and any of ``texts``.

    Designed so a single shared token does NOT produce a perfect score (e.g.
    "BONELESS & FRIES WITC SAUCE" must not strongly match "BURGER & BONELESS"). A
    perfect 1.0 is reserved for a substring hit or when *every* meaningful query token
    is present in the text; otherwise the score blends query-token coverage with the
    whole-string ratio.
    """
    normalized_query = normalize_text(query)
    if not normalized_query:
        return 0.0

    query_tokens = tokenize(query)
    query_meaningful = _meaningful_tokens(query_tokens)
    best = 0.0

    for text in texts:
        if not text:
            continue
        normalized_text = normalize_text(text)
        if not normalized_text:
            continue

        if normalized_query in normalized_text or normalized_text in normalized_query:
            return 1.0

        text_tokens = tokenize(text)
        text_meaningful = _meaningful_tokens(text_tokens)

        # Full keyword coverage: every meaningful query token appears verbatim.
        if query_meaningful and all(qt in text_tokens for qt in query_meaningful):
            return 1.0

        coverage = _query_coverage(query_meaningful, text_meaningful)
        sequence = SequenceMatcher(None, normalized_query, normalized_text).ratio()
        blended = _COVERAGE_WEIGHT * coverage + _SEQUENCE_WEIGHT * sequence
        best = max(best, blended, sequence)

    return best
