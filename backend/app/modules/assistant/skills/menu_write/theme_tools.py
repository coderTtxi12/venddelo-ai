"""Digital menu theme listing, recommendation, and apply helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.core.exceptions import NotFoundError, ValidationError
from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.db.models.menu_import_session import MenuImportSession
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.session_schemas import MenuImportSessionStatus
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRecord
from app.modules.restaurants.schemas import RestaurantUpdate
from app.modules.restaurants.service import RestaurantService


@dataclass(frozen=True, slots=True)
class ThemeRecommendation:
    theme_id: str
    label: str
    reason_es: str


def _theme_payload(theme: DigitalMenuThemeRecord) -> dict[str, Any]:
    return {
        "id": theme.id,
        "label": theme.label,
        "description": theme.description,
        "best_for": theme.best_for,
        "recommendation": theme.recommendation,
        "style_keywords": theme.style_keywords,
        "colors": theme.colors,
        "typography": theme.typography,
    }


def list_menu_themes(ctx: AgentContext) -> list[dict[str, Any]]:
    themes = ctx.uow.digital_menu_themes.list_active()
    return [_theme_payload(theme) for theme in themes]


def get_current_menu_theme(ctx: AgentContext) -> dict[str, Any] | None:
    restaurant_service = RestaurantService(ctx.uow.restaurants)
    restaurant = restaurant_service.get(ctx.restaurant_id)
    theme_id = str(restaurant.digital_menu_theme_id or "").strip()
    if not theme_id:
        return None
    active = ctx.uow.digital_menu_themes.list_active()
    theme = next((entry for entry in active if entry.id == theme_id), None)
    if theme is None:
        return {"theme_id": theme_id, "label": theme_id, "in_catalog": False}
    return {**_theme_payload(theme), "theme_id": theme.id, "in_catalog": True}


def _collect_chat_json(provider: LLMProviderPort, request: ChatCompletionRequest) -> dict[str, Any]:
    content = ""
    for event in provider.stream_chat(request):
        if event.event == "message.complete":
            content = (event.data.get("content") or "").strip()
            break
    if not content:
        return {}
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _recommendation_context(
    ctx: AgentContext,
    *,
    discovery_answers: dict[str, Any] | None = None,
    hints: dict[str, Any] | None = None,
    session: MenuImportSession | None = None,
) -> dict[str, Any]:
    context: dict[str, Any] = {}
    if session is not None and session.discovery_answers:
        context.update(session.discovery_answers)
    if discovery_answers:
        context.update(discovery_answers)
    if hints:
        context.update(hints)
    if context:
        return context

    restaurant_service = RestaurantService(ctx.uow.restaurants)
    restaurant = restaurant_service.get(ctx.restaurant_id)
    return {
        "restaurant_name": restaurant.name,
        "description": restaurant.description or "",
        "current_theme_id": restaurant.digital_menu_theme_id,
    }


def _build_recommend_prompt(
    themes: list[DigitalMenuThemeRecord],
    context: dict[str, Any],
) -> str:
    theme_lines = []
    for theme in themes:
        theme_lines.append(
            f'- id={theme.id!r} label={theme.label!r} description={theme.description!r} '
            f'best_for={theme.best_for!r} style_keywords={theme.style_keywords!r}'
        )
    themes_block = "\n".join(theme_lines)
    context_block = json.dumps(context, ensure_ascii=False, indent=2)
    return f"""Recommend the top 3 digital menu themes for a restaurant.

Restaurant context:
{context_block}

Available themes (choose only from these ids):
{themes_block}

Return strict JSON:
{{
  "recommendations": [
    {{
      "theme_id": "theme id from catalog",
      "reason_es": "short reason in Spanish"
    }}
  ]
}}

Rules:
- Return exactly 3 recommendations when at least 3 themes exist; otherwise return all available.
- theme_id must be one of the listed ids.
- Order from best to third-best fit.
"""


def recommend_menu_theme(
    ctx: AgentContext,
    *,
    discovery_answers: dict[str, Any] | None = None,
    hints: dict[str, Any] | None = None,
    session: MenuImportSession | None = None,
    llm: LLMProviderPort | None = None,
) -> list[ThemeRecommendation]:
    themes = ctx.uow.digital_menu_themes.list_active()
    if not themes:
        return []

    context = _recommendation_context(
        ctx,
        discovery_answers=discovery_answers,
        hints=hints,
        session=session,
    )
    provider = llm or build_llm_provider()
    data = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[
                ChatCompletionMessage(
                    role="system",
                    content=_build_recommend_prompt(themes, context),
                ),
                ChatCompletionMessage(
                    role="user",
                    content="Recommend the best themes for this restaurant.",
                ),
            ],
            response_format="json_object",
        ),
    )

    by_id = {theme.id: theme for theme in themes}
    recommendations: list[ThemeRecommendation] = []
    raw_items = data.get("recommendations") or []
    if not isinstance(raw_items, list):
        raw_items = []

    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        theme_id = str(entry.get("theme_id") or "").strip()
        theme = by_id.get(theme_id)
        if theme is None:
            continue
        recommendations.append(
            ThemeRecommendation(
                theme_id=theme.id,
                label=theme.label,
                reason_es=str(entry.get("reason_es") or theme.recommendation).strip(),
            )
        )
        if len(recommendations) >= 3:
            break

    if not recommendations:
        for theme in themes[:3]:
            recommendations.append(
                ThemeRecommendation(
                    theme_id=theme.id,
                    label=theme.label,
                    reason_es=theme.recommendation or theme.description,
                )
            )
    return recommendations


def _sync_import_session_theme(
    ctx: AgentContext,
    theme_id: str,
    *,
    session: MenuImportSession | None = None,
) -> None:
    from app.modules.assistant.skills.menu_import.session_repository import (
        MenuImportSessionRepository,
    )

    linked = session
    if linked is None:
        linked = MenuImportSessionRepository(ctx.uow.session).get_active_for_restaurant(
            ctx.restaurant_id
        )
    if linked is None:
        return

    linked.selected_theme_id = theme_id
    if linked.status == MenuImportSessionStatus.SELECTING_THEME.value:
        linked.status = MenuImportSessionStatus.PREVIEW_BATCH.value
    MenuImportSessionRepository(ctx.uow.session).update(linked)


def apply_menu_theme(
    ctx: AgentContext,
    theme_id: str,
    *,
    session: MenuImportSession | None = None,
) -> dict[str, Any]:
    normalized = str(theme_id).strip()
    if not normalized:
        raise ValidationError("theme_id is required")

    active = ctx.uow.digital_menu_themes.list_active()
    theme = next((entry for entry in active if entry.id == normalized), None)
    if theme is None:
        raise NotFoundError(f"Theme {normalized!r} not found or inactive")

    restaurant_service = RestaurantService(ctx.uow.restaurants)
    updated = restaurant_service.update(
        ctx.restaurant_id,
        RestaurantUpdate(digital_menu_theme_id=normalized),
    )

    _sync_import_session_theme(ctx, normalized, session=session)

    return {
        "theme_id": normalized,
        "label": theme.label,
        "colors": dict(theme.colors or {}),
        "typography": dict(theme.typography or {}),
        "restaurant_id": str(updated.id),
    }
