"""menu_intelligence skill — vision analysis and complement suggestions."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.exceptions import NotFoundError, ValidationError
from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionError
from app.infra.storage.factory import build_storage
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_intelligence.catalog_hints import (
    existing_groups_payload,
    gather_beverage_menu_hints,
    gather_peer_complement_patterns,
)
from app.modules.assistant.skills.menu_intelligence.image_loader import (
    load_product_image_bytes,
    product_has_image_path,
)
from app.modules.assistant.skills.menu_intelligence.prompts import (
    build_complement_suggestion_prompt,
    build_image_analysis_prompt,
)
from app.modules.assistant.skills.menu_media.product_context import gather_product_context
from app.modules.assistant.skills.product_resolve import resolve_product
from app.modules.menu.schemas import ProductDTO
from app.modules.menu.service import MenuService


def _parse_uuid(value: Any, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {field}") from exc


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolve_product(
    service: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
) -> tuple[ProductDTO | None, ToolResult | None]:
    product_id_raw = args.get("product_id")
    if product_id_raw:
        try:
            product_id = _parse_uuid(product_id_raw, "product_id")
        except ValidationError as exc:
            return None, ToolResult(ok=False, summary=str(exc))
        try:
            return service.get_product_by_id(ctx.restaurant_id, product_id), None
        except NotFoundError:
            return None, ToolResult(ok=False, summary="Product not found")

    name_raw = args.get("name") or args.get("product_name")
    if not name_raw:
        return None, ToolResult(ok=False, summary="Provide product_id or name")

    resolved = resolve_product(service, ctx.restaurant_id, str(name_raw))
    if resolved.status == "found" and resolved.product is not None:
        return resolved.product, None
    if resolved.status == "ambiguous":
        labels = ", ".join(product.name for _, product in resolved.matches[:5])
        return None, ToolResult(
            ok=False,
            summary=f"Ambiguous product name; candidates: {labels}",
            data={
                "candidates": [
                    {"id": str(product.id), "name": product.name, "match_score": round(score, 3)}
                    for score, product in resolved.matches[:5]
                ]
            },
        )
    return None, ToolResult(ok=False, summary=f"No product match for {name_raw!r}")


def _analysis_context(
    ctx: AgentContext,
    service: MenuService,
    product: ProductDTO,
) -> dict[str, Any]:
    payload = gather_product_context(ctx, service, product)
    payload["existing_option_groups"] = existing_groups_payload(product)
    return payload


def _run_image_analysis(
    ctx: AgentContext,
    service: MenuService,
    product: ProductDTO,
) -> tuple[dict[str, Any] | None, ToolResult | None]:
    if not product_has_image_path(product):
        return None, ToolResult(
            ok=False,
            summary=f"Product {product.name!r} has no image_path to analyze",
            data={"product_id": str(product.id), "image_path": None},
        )

    context = _analysis_context(ctx, service, product)
    try:
        image_bytes, media_type = load_product_image_bytes(build_storage(), product)
        result = build_vision_provider().analyze_json(
            VisionAnalysisRequest(
                prompt=build_image_analysis_prompt(context),
                image_bytes=image_bytes,
                image_media_type=media_type,
            )
        )
    except (StorageError, VisionError) as exc:
        return None, ToolResult(
            ok=False,
            summary=f"Image analysis failed for {product.name!r}: {exc}",
            data={"product_id": str(product.id), "image_path": product.image_path},
        )

    return result.data, None


class MenuIntelligenceSkill:
    id = "menu_intelligence"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="analyze_product_image",
                description=(
                    "Analyze the product's menu photo with vision AI. Uses image_path from "
                    "storage plus product name/description and existing complements. Returns "
                    "visible components and add-on ideas seen in the photo. Read-only."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "name": {"type": "string"},
                        "product_name": {"type": "string", "description": "Alias for name."},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="suggest_complements",
                description=(
                    "Suggest NEW complement option groups and items for ONE product. Combines "
                    "vision photo analysis (when image_path exists), peer products in the same "
                    "category, and beverage menu names for inspiration. All suggested items are "
                    "new option_items for this product only — never shared IDs with other "
                    "products. Read-only proposal; owner confirms then use menu_write "
                    "add_option_group / add_option_item to apply."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "name": {"type": "string"},
                        "product_name": {"type": "string"},
                        "include_image_analysis": {
                            "type": "boolean",
                            "description": (
                                "When true (default), analyze the product photo if image_path exists."
                            ),
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)

        if tool_name == "analyze_product_image":
            product, resolve_error = _resolve_product(service, ctx, args)
            if resolve_error is not None:
                return resolve_error
            assert product is not None

            analysis, error = _run_image_analysis(ctx, service, product)
            if error is not None:
                return error
            assert analysis is not None

            return ToolResult(
                ok=True,
                summary=f"Analyzed photo for {product.name}",
                data={
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "image_path": product.image_path,
                    "analysis": analysis,
                },
            )

        if tool_name == "suggest_complements":
            product, resolve_error = _resolve_product(service, ctx, args)
            if resolve_error is not None:
                return resolve_error
            assert product is not None

            include_image = bool(args.get("include_image_analysis", True))
            image_analysis: dict[str, Any] | None = None
            if include_image and product_has_image_path(product):
                image_analysis, image_error = _run_image_analysis(ctx, service, product)
                if image_error is not None:
                    return image_error

            context = _analysis_context(ctx, service, product)
            peer_patterns = gather_peer_complement_patterns(service, ctx.restaurant_id, product)
            beverage_hints = gather_beverage_menu_hints(service, ctx.restaurant_id)

            try:
                result = build_vision_provider().analyze_json(
                    VisionAnalysisRequest(
                        prompt=build_complement_suggestion_prompt(
                            context,
                            image_analysis=image_analysis,
                            peer_patterns=peer_patterns,
                            beverage_hints=beverage_hints,
                        ),
                        image_bytes=None,
                    )
                )
            except VisionError as exc:
                return ToolResult(
                    ok=False,
                    summary=f"Complement suggestion failed for {product.name!r}: {exc}",
                    data={"product_id": str(product.id)},
                )

            suggested_groups = result.data.get("suggested_groups")
            if not isinstance(suggested_groups, list):
                return ToolResult(
                    ok=False,
                    summary="Vision model returned no suggested_groups array",
                    data={"product_id": str(product.id), "raw": result.data},
                )

            group_count = len(suggested_groups)
            item_count = sum(
                len(group.get("items") or [])
                for group in suggested_groups
                if isinstance(group, dict)
            )
            return ToolResult(
                ok=True,
                summary=(
                    f"Suggested {group_count} complement group(s) "
                    f"({item_count} new items) for {product.name}"
                ),
                data={
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "image_path": product.image_path,
                    "image_analysis": image_analysis,
                    "peer_patterns_used": len(peer_patterns),
                    "beverage_hints_used": len(beverage_hints),
                    "suggested_groups": suggested_groups,
                    "notes": result.data.get("notes"),
                    "apply_with": "menu_write add_option_group / add_option_item after owner confirms",
                },
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
