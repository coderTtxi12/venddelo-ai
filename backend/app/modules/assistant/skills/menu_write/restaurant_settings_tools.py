"""Restaurant profile, branding, and schedule tools for menu_write."""

from __future__ import annotations

from collections.abc import Callable
from datetime import time
from typing import Any, Literal

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.infra.storage.factory import build_storage
from app.modules.assistant.import_asset_paths import resolve_branding_image_path
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.public_menu_url import build_public_menu_url
from app.modules.delivery_providers.partnerships import DeliveryPartnershipService
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantUpdate,
    ScheduleCreate,
)
from app.modules.restaurants.service import RestaurantService

DAY_LABELS_ES = (
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
)
ALLOWED_SERVICE_TYPES = frozenset({"takeout", "delivery"})
ALLOWED_PAYMENT_METHODS = frozenset({"cash", "transfer", "card_terminal"})


def _partnership_service(ctx: AgentContext) -> DeliveryPartnershipService:
    return DeliveryPartnershipService(
        ctx.uow.delivery_providers,
        restaurant_repo=ctx.uow.restaurants,
    )


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _format_time(value: time) -> str:
    return value.strftime("%H:%M")


def _parse_time(value: Any, *, field: str) -> time:
    text = _optional_str(value)
    if not text:
        raise ValidationError(f"{field} is required")
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            from datetime import datetime

            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    raise ValidationError(f"{field} must be HH:MM or HH:MM:SS (got {text!r})")


def _schedule_row_payload(row: Any) -> dict[str, Any]:
    day = int(row.day_of_week)
    day_label = DAY_LABELS_ES[day] if 0 <= day < len(DAY_LABELS_ES) else str(day)
    return {
        "id": str(row.id),
        "service_type": row.service_type,
        "day_of_week": day,
        "day_label_es": day_label,
        "opens_at": _format_time(row.opens_at),
        "closes_at": _format_time(row.closes_at),
    }


def get_restaurant_name(ctx: AgentContext) -> ToolResult:
    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    return ToolResult(
        ok=True,
        summary=f"Restaurant name: {restaurant.name!r}",
        data={"name": restaurant.name, "restaurant_id": str(restaurant.id)},
    )


def get_restaurant_public_menu_url(ctx: AgentContext) -> ToolResult:
    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    public_menu_url = build_public_menu_url(restaurant.subdomain, settings=get_settings())
    if not public_menu_url:
        return ToolResult(
            ok=False,
            summary="Restaurant has no subdomain configured for a public menu URL",
        )
    return ToolResult(
        ok=True,
        summary=f"Public menu URL: {public_menu_url}",
        data={
            "public_menu_url": public_menu_url,
            "subdomain": restaurant.subdomain,
            "name": restaurant.name,
            "restaurant_id": str(restaurant.id),
        },
    )


def get_restaurant_schedules(ctx: AgentContext) -> ToolResult:
    schedules = RestaurantService(ctx.uow.restaurants).list_schedules(ctx.restaurant_id)
    payload = [_schedule_row_payload(row) for row in schedules]
    return ToolResult(
        ok=True,
        summary=f"Listed {len(payload)} schedule row(s)",
        data={"schedules": payload},
    )


def set_restaurant_schedules(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = args.get("schedules")
    if not isinstance(raw, list):
        return ToolResult(ok=False, summary="schedules must be a non-empty array")
    if not raw:
        return ToolResult(ok=False, summary="schedules must be a non-empty array")
    if len(raw) > 200:
        return ToolResult(ok=False, summary="At most 200 schedule rows per call")

    parsed: list[ScheduleCreate] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            return ToolResult(ok=False, summary=f"schedules[{index}] must be an object")
        service_type = _optional_str(entry.get("service_type"))
        if service_type not in ALLOWED_SERVICE_TYPES:
            return ToolResult(
                ok=False,
                summary=f"schedules[{index}].service_type must be takeout or delivery",
            )
        try:
            day_of_week = int(entry.get("day_of_week"))
        except (TypeError, ValueError):
            return ToolResult(
                ok=False,
                summary=f"schedules[{index}].day_of_week must be 0-6 (Mon-Sun)",
            )
        if day_of_week < 0 or day_of_week > 6:
            return ToolResult(
                ok=False,
                summary=f"schedules[{index}].day_of_week must be 0-6 (Mon-Sun)",
            )
        try:
            opens_at = _parse_time(entry.get("opens_at"), field=f"schedules[{index}].opens_at")
            closes_at = _parse_time(entry.get("closes_at"), field=f"schedules[{index}].closes_at")
        except ValidationError as exc:
            return ToolResult(ok=False, summary=str(exc))
        parsed.append(
            ScheduleCreate(
                service_type=service_type,
                day_of_week=day_of_week,
                opens_at=opens_at,
                closes_at=closes_at,
            )
        )

    RestaurantService(ctx.uow.restaurants).set_schedules(ctx.restaurant_id, parsed)
    invalidate(ctx)
    return ToolResult(
        ok=True,
        summary=f"Updated restaurant schedule ({len(parsed)} row(s))",
        data={"schedules": [row.model_dump(mode="json") for row in parsed]},
    )


def _assign_branding_image(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    folder: Literal["logo", "cover"],
    field_name: Literal["logo_path", "cover_path"],
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    storage_path = _optional_str(args.get("storage_path") or args.get("image_path"))
    if not storage_path:
        return ToolResult(ok=False, summary="storage_path is required")

    try:
        final_path = resolve_branding_image_path(
            build_storage(),
            ctx.restaurant_id,
            storage_path,
            folder=folder,
        )
    except ValidationError as exc:
        return ToolResult(ok=False, summary=str(exc))

    restaurant_service = RestaurantService(ctx.uow.restaurants)
    updated = restaurant_service.update(
        ctx.restaurant_id,
        RestaurantUpdate(**{field_name: final_path}),
    )
    if updated is None:
        raise NotFoundError("Restaurant not found")

    invalidate(ctx)
    label = "logo" if folder == "logo" else "cover"
    return ToolResult(
        ok=True,
        summary=f"Assigned restaurant {label}",
        data={"restaurant_id": str(updated.id), field_name: final_path},
    )


def assign_restaurant_logo(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    return _assign_branding_image(
        ctx,
        args,
        folder="logo",
        field_name="logo_path",
        invalidate=invalidate,
    )


def assign_restaurant_cover(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    return _assign_branding_image(
        ctx,
        args,
        folder="cover",
        field_name="cover_path",
        invalidate=invalidate,
    )


def _remove_branding_image(
    ctx: AgentContext,
    *,
    field_name: Literal["logo_path", "cover_path"],
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    restaurant_service = RestaurantService(ctx.uow.restaurants)
    restaurant = restaurant_service.get(ctx.restaurant_id)
    current = getattr(restaurant, field_name)
    label = "logo" if field_name == "logo_path" else "cover"
    if not current:
        return ToolResult(
            ok=True,
            summary=f"Restaurant already has no {label}",
            data={"restaurant_id": str(restaurant.id), field_name: None},
        )

    updated = restaurant_service.update(
        ctx.restaurant_id,
        RestaurantUpdate(**{field_name: None}),
    )
    if updated is None:
        raise NotFoundError("Restaurant not found")

    invalidate(ctx)
    return ToolResult(
        ok=True,
        summary=f"Removed restaurant {label}",
        data={"restaurant_id": str(updated.id), field_name: None},
    )


def remove_restaurant_logo(
    ctx: AgentContext,
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    return _remove_branding_image(ctx, field_name="logo_path", invalidate=invalidate)


def remove_restaurant_cover(
    ctx: AgentContext,
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    return _remove_branding_image(ctx, field_name="cover_path", invalidate=invalidate)


def get_restaurant_description(ctx: AgentContext) -> ToolResult:
    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    description = restaurant.description
    summary = (
        f"Restaurant description: {description!r}"
        if description
        else "Restaurant has no description set"
    )
    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "description": description,
            "name": restaurant.name,
            "restaurant_id": str(restaurant.id),
        },
    )


def update_restaurant_description(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    if "description" not in args:
        return ToolResult(ok=False, summary="description is required (string; empty clears it)")
    raw = args.get("description")
    if raw is not None and not isinstance(raw, str):
        return ToolResult(ok=False, summary="description must be a string or null")
    description = raw.strip() if isinstance(raw, str) else None
    if description == "":
        description = None

    updated = RestaurantService(ctx.uow.restaurants).update(
        ctx.restaurant_id,
        RestaurantUpdate(description=description),
    )
    if updated is None:
        raise NotFoundError("Restaurant not found")

    invalidate(ctx)
    return ToolResult(
        ok=True,
        summary=(
            "Updated restaurant description"
            if description
            else "Cleared restaurant description"
        ),
        data={
            "description": updated.description,
            "restaurant_id": str(updated.id),
        },
    )


def get_restaurant_location(ctx: AgentContext) -> ToolResult:
    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    return ToolResult(
        ok=True,
        summary=(
            f"Location: {restaurant.address!r}"
            if restaurant.address
            else "Restaurant has no address set"
        ),
        data={
            "address": restaurant.address,
            "latitude": restaurant.latitude,
            "longitude": restaurant.longitude,
            "place_id": restaurant.place_id,
            "name": restaurant.name,
            "restaurant_id": str(restaurant.id),
        },
    )


def update_restaurant_location(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    patch: dict[str, Any] = {}
    if "address" in args:
        raw_address = args.get("address")
        if raw_address is not None and not isinstance(raw_address, str):
            return ToolResult(ok=False, summary="address must be a string or null")
        address = raw_address.strip() if isinstance(raw_address, str) else None
        patch["address"] = address or None
    for field in ("latitude", "longitude"):
        if field not in args:
            continue
        value = args.get(field)
        if value is None:
            patch[field] = None
            continue
        try:
            patch[field] = float(value)
        except (TypeError, ValueError):
            return ToolResult(ok=False, summary=f"{field} must be a number or null")
    if "place_id" in args:
        raw_place = args.get("place_id")
        if raw_place is not None and not isinstance(raw_place, str):
            return ToolResult(ok=False, summary="place_id must be a string or null")
        place_id = raw_place.strip() if isinstance(raw_place, str) else None
        patch["place_id"] = place_id or None

    if not patch:
        return ToolResult(
            ok=False,
            summary="Provide at least one of: address, latitude, longitude, place_id",
        )

    updated = RestaurantService(ctx.uow.restaurants).update(
        ctx.restaurant_id,
        RestaurantUpdate(**patch),
    )
    if updated is None:
        raise NotFoundError("Restaurant not found")

    invalidate(ctx)
    return ToolResult(
        ok=True,
        summary="Updated restaurant location",
        data={
            "address": updated.address,
            "latitude": updated.latitude,
            "longitude": updated.longitude,
            "place_id": updated.place_id,
            "restaurant_id": str(updated.id),
        },
    )


def get_restaurant_payment_methods(ctx: AgentContext) -> ToolResult:
    partnership = _partnership_service(ctx)
    partnership.ensure_restaurant_delivery_payment_methods(ctx.restaurant_id)
    methods = RestaurantService(ctx.uow.restaurants).list_payment_methods(ctx.restaurant_id)
    payload = [
        {
            "id": str(row.id),
            "method": row.method,
            "service_type": row.service_type,
            "enabled": row.enabled,
        }
        for row in methods
    ]
    return ToolResult(
        ok=True,
        summary=f"Listed {len(payload)} payment method row(s)",
        data={"payment_methods": payload},
    )


def set_restaurant_payment_methods(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = args.get("payment_methods")
    if not isinstance(raw, list):
        return ToolResult(ok=False, summary="payment_methods must be a non-empty array")
    if not raw:
        return ToolResult(ok=False, summary="payment_methods must be a non-empty array")
    if len(raw) > 50:
        return ToolResult(ok=False, summary="At most 50 payment method rows per call")

    parsed: list[PaymentMethodCreate] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            return ToolResult(ok=False, summary=f"payment_methods[{index}] must be an object")
        method = _optional_str(entry.get("method"))
        if method not in ALLOWED_PAYMENT_METHODS:
            return ToolResult(
                ok=False,
                summary=(
                    f"payment_methods[{index}].method must be "
                    "cash, transfer, or card_terminal"
                ),
            )
        service_type = _optional_str(entry.get("service_type"))
        if service_type not in ALLOWED_SERVICE_TYPES:
            return ToolResult(
                ok=False,
                summary=(
                    f"payment_methods[{index}].service_type must be takeout or delivery"
                ),
            )
        enabled = entry.get("enabled", True)
        if not isinstance(enabled, bool):
            return ToolResult(
                ok=False,
                summary=f"payment_methods[{index}].enabled must be a boolean",
            )
        parsed.append(
            PaymentMethodCreate(
                method=method,
                service_type=service_type,
                enabled=enabled,
            )
        )

    partnership = _partnership_service(ctx)
    try:
        partnership.validate_restaurant_payment_methods(ctx.restaurant_id, parsed)
    except ValidationError as exc:
        return ToolResult(ok=False, summary=str(exc))

    RestaurantService(ctx.uow.restaurants).set_payment_methods(ctx.restaurant_id, parsed)
    invalidate(ctx)
    return ToolResult(
        ok=True,
        summary=f"Updated restaurant payment methods ({len(parsed)} row(s))",
        data={"payment_methods": [row.model_dump(mode="json") for row in parsed]},
    )


def get_delivery_provider_schedules(ctx: AgentContext) -> ToolResult:
    partnership = _partnership_service(ctx)
    status = partnership.get_mexy_partnership_status(ctx.restaurant_id)
    partnership_row = status.partnership
    if partnership_row is None or partnership_row.status != "active":
        return ToolResult(
            ok=True,
            summary="No active delivery provider partnership; no courier schedules",
            data={
                "has_active_delivery_provider": False,
                "partnership_status": (
                    partnership_row.status if partnership_row is not None else None
                ),
                "schedules": [],
            },
        )

    rows = partnership.get_active_provider_schedules(ctx.restaurant_id)
    payload = [
        {
            "id": str(row.id),
            "schedule_kind": row.schedule_kind,
            "day_of_week": int(row.day_of_week),
            "day_label_es": (
                DAY_LABELS_ES[int(row.day_of_week)]
                if 0 <= int(row.day_of_week) < len(DAY_LABELS_ES)
                else str(row.day_of_week)
            ),
            "opens_at": _format_time(row.opens_at),
            "closes_at": _format_time(row.closes_at),
        }
        for row in rows
    ]
    return ToolResult(
        ok=True,
        summary=f"Listed {len(payload)} delivery provider schedule row(s)",
        data={
            "has_active_delivery_provider": True,
            "partnership_status": partnership_row.status,
            "schedules": payload,
        },
    )


def get_delivery_provider_payment_methods(ctx: AgentContext) -> ToolResult:
    partnership = _partnership_service(ctx)
    status = partnership.get_mexy_partnership_status(ctx.restaurant_id)
    partnership_row = status.partnership
    if partnership_row is None or partnership_row.status != "active":
        return ToolResult(
            ok=True,
            summary="No active delivery provider partnership; no courier payment methods",
            data={
                "has_active_delivery_provider": False,
                "partnership_status": (
                    partnership_row.status if partnership_row is not None else None
                ),
                "payment_methods": [],
            },
        )

    rows = partnership.get_active_provider_payment_methods(ctx.restaurant_id)
    payload = [
        {
            "id": str(row.id),
            "method": row.method,
            "enabled": row.enabled,
        }
        for row in rows
    ]
    return ToolResult(
        ok=True,
        summary=f"Listed {len(payload)} delivery provider payment method(s)",
        data={
            "has_active_delivery_provider": True,
            "partnership_status": partnership_row.status,
            "payment_methods": payload,
        },
    )


def get_restaurant_menu_qr(ctx: AgentContext) -> ToolResult:
    restaurant = RestaurantService(ctx.uow.restaurants).get(ctx.restaurant_id)
    public_menu_url = build_public_menu_url(restaurant.subdomain, settings=get_settings())
    if not public_menu_url:
        return ToolResult(
            ok=False,
            summary="Restaurant has no subdomain configured for a public menu QR",
        )
    return ToolResult(
        ok=True,
        summary=f"Menu QR encodes: {public_menu_url}",
        data={
            "qr_encodes_url": public_menu_url,
            "public_menu_url": public_menu_url,
            "subdomain": restaurant.subdomain,
            "name": restaurant.name,
            "restaurant_id": str(restaurant.id),
            "note": (
                "El código QR del menú digital codifica esta URL. "
                "El dueño puede mostrarlo o descargarlo desde Menú digital → Mostrar QR."
            ),
        },
    )
