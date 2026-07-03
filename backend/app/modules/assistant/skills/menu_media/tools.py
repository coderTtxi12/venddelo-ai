"""menu_media skill — AI product image generation for the digital menu."""

from __future__ import annotations

import uuid
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.exceptions import NotFoundError, ValidationError
from app.core.image.ports import ImageGenerationError, ImageGenerationRequest
from app.core.storage import StorageError
from app.infra.image.factory import build_image_provider
from app.infra.storage.factory import build_storage
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_media.product_context import (
    gather_product_context,
    product_has_image,
    resolve_product_ids,
)
from app.modules.assistant.skills.menu_media.prompt import build_food_image_prompt
from app.modules.assistant.skills.menu_media.storage_paths import (
    PRODUCT_IMAGE_CONTENT_TYPE,
    product_image_storage_path,
)
from app.modules.assistant.skills.product_resolve import resolve_product
from app.modules.menu.schemas import ProductDTO, ProductUpdate
from app.modules.menu.service import MenuService

BULK_IMAGE_LIMIT = 10
PRODUCT_SCAN_LIMIT = 500


def _parse_uuid(value: Any, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {field}") from exc


def _parse_uuid_list(value: Any, field: str) -> list[uuid.UUID]:
    if not isinstance(value, list) or not value:
        raise ValidationError(f"{field} must be a non-empty array")
    return [_parse_uuid(item, field) for item in value]


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _invalidate_menu_cache(ctx: AgentContext) -> None:
    invalidate_restaurant_menu_cache(ctx.uow, ctx.restaurant_id)


def _resolve_product_for_media(
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
            return service.get_product(ctx.restaurant_id, product_id), None
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


def _generate_and_attach_image(
    *,
    ctx: AgentContext,
    service: MenuService,
    product: ProductDTO,
    style_notes: str | None,
    force: bool,
) -> ToolResult:
    context = gather_product_context(ctx, service, product)
    if product_has_image(context) and not force:
        return ToolResult(
            ok=False,
            summary=(
                f"Product {product.name!r} already has an image; "
                "pass force=true to replace it"
            ),
            data={"product_id": str(product.id), "image_path": product.image_path},
        )

    prompt = build_food_image_prompt(context, style_notes=style_notes)
    try:
        generated = build_image_provider().generate(ImageGenerationRequest(prompt=prompt))
        content_type = generated.content_type or PRODUCT_IMAGE_CONTENT_TYPE
        if content_type != PRODUCT_IMAGE_CONTENT_TYPE:
            content_type = PRODUCT_IMAGE_CONTENT_TYPE
        stored = build_storage().upload(
            product_image_storage_path(ctx.restaurant_id),
            generated.data,
            content_type,
        )
    except (ImageGenerationError, StorageError) as exc:
        return ToolResult(
            ok=False,
            summary=f"Image generation failed for {product.name!r}: {exc}",
            data={"product_id": str(product.id), "prompt_preview": prompt[:240]},
        )

    try:
        updated = service.update_product(
            ctx.restaurant_id,
            product.id,
            ProductUpdate(image_path=stored.path),
        )
    except NotFoundError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Product not found")

    _invalidate_menu_cache(ctx)
    return ToolResult(
        ok=True,
        summary=f"Generated appetizing image for {updated.name}",
        data={
            "product": {
                "id": str(updated.id),
                "name": updated.name,
                "image_path": updated.image_path,
                "public_url": stored.public_url,
            },
            "prompt_preview": prompt[:240],
            "image_model": generated.model,
            "revised_prompt": generated.revised_prompt,
        },
    )


class MenuMediaSkill:
    id = "menu_media"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="generate_product_image",
                description=(
                    "Generate an appetizing AI food photo for ONE product and attach it to "
                    "the menu. Before generating, the tool loads full product context "
                    "(name, description, categories, add-ons/complements, promotions). "
                    "Use after menu_read when the owner confirms. Skips products that already "
                    "have image_path unless force=true. Requires owner confirmation before "
                    "calling (mutates the product)."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "name": {
                            "type": "string",
                            "description": "Product name when product_id is omitted.",
                        },
                        "product_name": {
                            "type": "string",
                            "description": "Alias for name.",
                        },
                        "style_notes": {
                            "type": "string",
                            "description": (
                                "Optional extra art direction (e.g. 'top-down', 'with lime wedge')."
                            ),
                        },
                        "force": {
                            "type": "boolean",
                            "description": "Replace an existing image_path when true.",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="bulk_generate_product_images",
                description=(
                    "Generate appetizing AI food photos for MANY products in one call. "
                    "Each product is loaded with full context before generation. "
                    "Default: only active products missing image_path. "
                    f"Max {BULK_IMAGE_LIMIT} products per call. "
                    "Confirm the product list with the owner before calling."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "Explicit product UUIDs to generate for. "
                                "When omitted, scans the catalog for products without images."
                            ),
                        },
                        "only_missing": {
                            "type": "boolean",
                            "description": "Skip products that already have image_path.",
                            "default": True,
                        },
                        "limit": {
                            "type": "integer",
                            "description": f"Max products to process (1–{BULK_IMAGE_LIMIT}).",
                            "default": BULK_IMAGE_LIMIT,
                        },
                        "style_notes": {"type": "string"},
                        "force": {
                            "type": "boolean",
                            "description": "Replace existing images when true.",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)

        if tool_name == "generate_product_image":
            product, resolve_error = _resolve_product_for_media(service, ctx, args)
            if resolve_error is not None:
                return resolve_error
            assert product is not None
            return _generate_and_attach_image(
                ctx=ctx,
                service=service,
                product=product,
                style_notes=_optional_str(args.get("style_notes")),
                force=bool(args.get("force", False)),
            )

        if tool_name == "bulk_generate_product_images":
            only_missing = bool(args.get("only_missing", True))
            force = bool(args.get("force", False))
            if force:
                only_missing = False

            limit_raw = args.get("limit", BULK_IMAGE_LIMIT)
            try:
                limit = int(limit_raw)
            except (TypeError, ValueError):
                return ToolResult(ok=False, summary="limit must be an integer")
            limit = max(1, min(limit, BULK_IMAGE_LIMIT))

            product_ids: list[uuid.UUID] | None = None
            if args.get("product_ids") is not None:
                try:
                    product_ids = _parse_uuid_list(args.get("product_ids"), "product_ids")
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))

            try:
                products = resolve_product_ids(
                    service,
                    ctx.restaurant_id,
                    product_ids=product_ids,
                    only_missing=only_missing,
                    limit=limit,
                )
            except NotFoundError as exc:
                return ToolResult(ok=False, summary=str(exc) or "Product not found")

            if not products:
                return ToolResult(
                    ok=True,
                    summary="No products need image generation",
                    data={"results": [], "processed": 0, "succeeded": 0, "failed": 0},
                )

            results: list[dict[str, Any]] = []
            succeeded = 0
            failed = 0
            for product in products:
                outcome = _generate_and_attach_image(
                    ctx=ctx,
                    service=service,
                    product=product,
                    style_notes=_optional_str(args.get("style_notes")),
                    force=force,
                )
                row = {
                    "product_id": str(product.id),
                    "name": product.name,
                    "ok": outcome.ok,
                    "summary": outcome.summary,
                }
                if outcome.ok:
                    succeeded += 1
                    row["image_path"] = outcome.data.get("product", {}).get("image_path")
                    row["public_url"] = outcome.data.get("product", {}).get("public_url")
                else:
                    failed += 1
                    row["error"] = outcome.summary
                results.append(row)

            return ToolResult(
                ok=failed == 0,
                summary=(
                    f"Generated images for {succeeded} of {len(products)} products"
                    + (f" ({failed} failed)" if failed else "")
                ),
                data={
                    "results": results,
                    "processed": len(products),
                    "succeeded": succeeded,
                    "failed": failed,
                },
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
