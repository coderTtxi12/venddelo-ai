"""Match uploaded import photos to menu products using vision."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionError, VisionPort
from app.db.models.menu_import_session import MenuImportSession
from app.infra.storage.factory import build_storage
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.import_assets import validate_import_asset_path
from app.modules.assistant.skills.menu_import.photo_match_prompt import build_photo_match_prompt
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.modules.assistant.skills.menu_intelligence.image_loader import product_image_media_type
from app.modules.menu.schemas import ProductUpdate
from app.modules.menu.service import MenuService


UNCERTAIN_MIN_CONFIDENCE = 0.30


@dataclass(frozen=True, slots=True)
class PhotoMatchResult:
    matched: list[dict[str, Any]] = field(default_factory=list)
    uncertain: list[dict[str, Any]] = field(default_factory=list)
    unmatched: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ApplyPhotoMappingsResult:
    ok: bool
    summary: str
    updated: int = 0


def _accumulated_ref_map(draft_batches: list[Any]) -> dict[str, uuid.UUID]:
    merged: dict[str, uuid.UUID] = {}
    for entry in draft_batches:
        if not isinstance(entry, dict) or not entry.get("applied_at"):
            continue
        raw_map = entry.get("ref_map") or {}
        if not isinstance(raw_map, dict):
            continue
        for ref, value in raw_map.items():
            if not str(ref).startswith("prod_"):
                continue
            try:
                merged[str(ref)] = uuid.UUID(str(value))
            except (TypeError, ValueError):
                continue
    return merged


def _product_catalog(
    menu: MenuService,
    ctx: AgentContext,
    ref_map: dict[str, uuid.UUID],
) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for ref, product_id in ref_map.items():
        product = menu.get_product_by_id(ctx.restaurant_id, product_id)
        catalog.append(
            {
                "ref": ref,
                "name": product.name,
                "description": product.description,
            }
        )
    return catalog


def _load_image_bytes(path: str) -> tuple[bytes, str]:
    storage = build_storage()
    try:
        data = storage.read(path)
    except StorageError as exc:
        raise ValidationError(f"Could not read image at {path}") from exc
    return data, product_image_media_type(path)


def _classify_match(
    *,
    image_path: str,
    analysis: dict[str, Any],
    threshold: float,
) -> tuple[str, dict[str, Any]]:
    product_ref = analysis.get("product_ref")
    if product_ref is not None:
        product_ref = str(product_ref).strip() or None

    confidence_raw = analysis.get("confidence", 0.0)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0

    reason_es = str(analysis.get("reason_es") or "").strip()

    if product_ref and confidence >= threshold:
        return "matched", {
            "image_path": image_path,
            "product_ref": product_ref,
            "confidence": round(confidence, 3),
            "reason_es": reason_es,
        }

    candidates_raw = analysis.get("candidates") or []
    candidates: list[dict[str, Any]] = []
    if isinstance(candidates_raw, list):
        for entry in candidates_raw[:3]:
            if not isinstance(entry, dict):
                continue
            ref = entry.get("product_ref")
            if not ref:
                continue
            try:
                cand_conf = float(entry.get("confidence", 0.0))
            except (TypeError, ValueError):
                cand_conf = 0.0
            candidates.append(
                {
                    "product_ref": str(ref),
                    "confidence": round(cand_conf, 3),
                    "reason_es": str(entry.get("reason_es") or "").strip(),
                }
            )

    if candidates or (product_ref and confidence >= UNCERTAIN_MIN_CONFIDENCE):
        if product_ref and not candidates:
            candidates = [
                {
                    "product_ref": product_ref,
                    "confidence": round(confidence, 3),
                    "reason_es": reason_es,
                }
            ]
        return "uncertain", {
            "image_path": image_path,
            "candidates": candidates,
            "reason_es": reason_es or "Coincidencia incierta; elige el producto correcto.",
        }

    return "unmatched", {
        "image_path": image_path,
        "reason_es": reason_es or "No se encontró un producto coincidente.",
    }


def _update_product_image_entry(
    product_images: list[Any],
    image_path: str,
    *,
    product_ref: str | None,
    confidence: float | None,
    status: str,
) -> None:
    for entry in product_images:
        if isinstance(entry, dict) and entry.get("path") == image_path:
            entry["mapped_product_ref"] = product_ref
            entry["confidence"] = confidence
            entry["status"] = status
            return
    product_images.append(
        {
            "path": image_path,
            "mapped_product_ref": product_ref,
            "confidence": confidence,
            "status": status,
        }
    )


def match_photos_to_products(
    session: MenuImportSession,
    ctx: AgentContext,
    *,
    vision: VisionPort | None = None,
) -> PhotoMatchResult:
    ref_map = _accumulated_ref_map(session.draft_batches or [])
    if not ref_map:
        raise ValidationError("Apply at least one batch before matching photos")

    menu = MenuService(ctx.uow.menu)
    catalog = _product_catalog(menu, ctx, ref_map)
    product_images = list(session.product_images or [])
    if not product_images:
        return PhotoMatchResult()

    provider = vision or build_vision_provider()
    threshold = get_settings().menu_import_photo_match_confidence_threshold

    matched: list[dict[str, Any]] = []
    uncertain: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    pending = [
        entry
        for entry in product_images
        if isinstance(entry, dict)
        and entry.get("path")
        and not entry.get("mapped_product_ref")
    ]

    for entry in pending:
        image_path = str(entry["path"])
        try:
            validate_import_asset_path(ctx.restaurant_id, image_path, kind="product_photo")
            image_bytes, media_type = _load_image_bytes(image_path)
        except ValidationError as exc:
            unmatched.append({"image_path": image_path, "reason_es": str(exc)})
            continue

        prompt = build_photo_match_prompt(
            catalog,
            image_path=image_path,
            original_name=entry.get("original_name"),
        )
        try:
            result = provider.analyze_json(
                VisionAnalysisRequest(
                    prompt=prompt,
                    image_bytes=image_bytes,
                    image_media_type=media_type,
                )
            )
        except VisionError as exc:
            unmatched.append(
                {
                    "image_path": image_path,
                    "reason_es": f"Error de visión: {exc}",
                }
            )
            continue

        classification, payload = _classify_match(
            image_path=image_path,
            analysis=result.data,
            threshold=threshold,
        )
        if classification == "matched":
            matched.append(payload)
            _update_product_image_entry(
                product_images,
                image_path,
                product_ref=payload["product_ref"],
                confidence=payload["confidence"],
                status="matched",
            )
        elif classification == "uncertain":
            uncertain.append(payload)
            _update_product_image_entry(
                product_images,
                image_path,
                product_ref=None,
                confidence=None,
                status="uncertain",
            )
        else:
            unmatched.append(payload)
            _update_product_image_entry(
                product_images,
                image_path,
                product_ref=None,
                confidence=None,
                status="unmatched",
            )

    session.product_images = product_images
    session.uncertain_images = uncertain
    session.unmatched_images = unmatched
    MenuImportSessionRepository(ctx.uow.session).update(session)

    return PhotoMatchResult(matched=matched, uncertain=uncertain, unmatched=unmatched)


def resolve_uncertain_image(
    session: MenuImportSession,
    image_path: str,
    product_ref: str,
) -> None:
    path = str(image_path).strip()
    ref = str(product_ref).strip()
    if not path or not ref:
        raise ValidationError("image_path and product_ref are required")

    uncertain = [
        entry
        for entry in (session.uncertain_images or [])
        if not (isinstance(entry, dict) and entry.get("image_path") == path)
    ]
    session.uncertain_images = uncertain

    product_images = list(session.product_images or [])
    _update_product_image_entry(
        product_images,
        path,
        product_ref=ref,
        confidence=1.0,
        status="resolved",
    )
    session.product_images = product_images


def apply_photo_mappings(
    session: MenuImportSession,
    ctx: AgentContext,
    *,
    confirmed: bool,
) -> ApplyPhotoMappingsResult:
    if not confirmed:
        return ApplyPhotoMappingsResult(
            ok=False,
            summary="confirmed=true is required to apply photo mappings",
        )

    ref_map = _accumulated_ref_map(session.draft_batches or [])
    menu = MenuService(ctx.uow.menu)
    updated = 0

    for entry in session.product_images or []:
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        if status not in {"matched", "resolved"}:
            continue
        product_ref = entry.get("mapped_product_ref")
        image_path = entry.get("path")
        if not product_ref or not image_path:
            continue
        product_id = ref_map.get(str(product_ref))
        if product_id is None:
            continue
        validate_import_asset_path(ctx.restaurant_id, str(image_path), kind="product_photo")
        menu.update_product(
            ctx.restaurant_id,
            product_id,
            ProductUpdate(image_path=str(image_path)),
        )
        updated += 1

    if updated:
        invalidate_restaurant_menu_cache(ctx.uow, ctx.restaurant_id)
        MenuImportSessionRepository(ctx.uow.session).update(session)

    if updated == 0:
        return ApplyPhotoMappingsResult(ok=False, summary="No photo mappings to apply")
    return ApplyPhotoMappingsResult(
        ok=True,
        summary=f"Applied {updated} product photo mapping(s)",
        updated=updated,
    )
