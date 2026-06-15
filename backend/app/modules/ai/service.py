from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any

from app.core.ai_gateway import AIGatewayPort
from app.core.exceptions import ConflictError, NotFoundError
from app.core.pagination import MAX_LIMIT, PaginationParams
from app.core.palettes import AVAILABLE_PALETTES
from app.core.storage import StoragePort
from app.modules.ai.job_repository import AIJobRepository
from app.modules.ai.repository import AIArtifactRepository
from app.modules.ai.schemas import (
    AIArtifactCreate,
    AIArtifactDTO,
    AIJobCreate,
    AIJobDTO,
    AIJobUpdate,
)
from app.modules.menu.repository import MenuRepository
from app.modules.menu.schemas import (
    CategoryCreate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
    ProductUpdate,
)
from app.modules.menu.service import MenuService
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import RestaurantUpdate

logger = logging.getLogger(__name__)


class AIService:
    def __init__(
        self,
        *,
        gateway: AIGatewayPort,
        storage: StoragePort,
        jobs: AIJobRepository,
        artifacts: AIArtifactRepository,
        menu_repo: MenuRepository,
        restaurants: RestaurantRepository,
    ) -> None:
        self._gateway = gateway
        self._storage = storage
        self._jobs = jobs
        self._artifacts = artifacts
        self._menu = MenuService(menu_repo)
        self._menu_repo = menu_repo
        self._restaurants = restaurants

    def create_extract_job(self, restaurant_id: uuid.UUID, *, storage_path: str) -> AIJobDTO:
        return self._jobs.add(
            AIJobCreate(
                restaurant_id=restaurant_id,
                job_type="extract_menu",
                input_ref=storage_path,
            )
        )

    def create_optimize_job(self, restaurant_id: uuid.UUID) -> AIJobDTO:
        return self._jobs.add(
            AIJobCreate(
                restaurant_id=restaurant_id,
                job_type="optimize_menu",
                input_ref=str(restaurant_id),
            )
        )

    def create_pick_palette_job(self, restaurant_id: uuid.UUID) -> AIJobDTO:
        return self._jobs.add(
            AIJobCreate(
                restaurant_id=restaurant_id,
                job_type="pick_palette",
                input_ref=str(restaurant_id),
            )
        )

    def get_job(self, restaurant_id: uuid.UUID, job_id: uuid.UUID) -> AIJobDTO:
        job = self._jobs.get(restaurant_id, job_id)
        if job is None:
            raise NotFoundError("Job not found")
        return job

    def list_artifacts(self, restaurant_id: uuid.UUID) -> list[AIArtifactDTO]:
        return self._artifacts.list_for_restaurant(restaurant_id)

    def _set_job_status(
        self,
        job_id: uuid.UUID,
        *,
        status: str,
        result_json: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        self._jobs.update(
            job_id,
            AIJobUpdate(
                status=status,
                result_json=result_json,
                error_message=error_message,
            ),
        )

    def run_extract_menu(self, job_id: uuid.UUID, restaurant_id: uuid.UUID) -> None:
        job = self.get_job(restaurant_id, job_id)
        if job.status not in {"pending", "processing"}:
            return
        self._set_job_status(job_id, status="processing")
        try:
            if not job.input_ref:
                raise ValueError("Missing upload path")
            file_bytes = self._storage.read(job.input_ref)
            content_type = "application/octet-stream"
            extraction = self._gateway.extract_menu(file_bytes, content_type)
            categories_created = 0
            products_created = 0
            category_ids: list[uuid.UUID] = []
            for cat in extraction.categories:
                created_cat = self._menu.create_category(
                    CategoryCreate(
                        restaurant_id=restaurant_id,
                        name=cat.name,
                        sort_index=categories_created,
                    )
                )
                categories_created += 1
                category_ids.append(created_cat.id)
                for prod in cat.products:
                    option_groups = [
                        OptionGroupCreate(
                            title=og.title,
                            required=og.required,
                            selection=og.selection,
                            items=[
                                OptionItemCreate(
                                    label=item.label,
                                    price_delta_cents=item.price_delta_cents,
                                )
                                for item in og.items
                            ],
                        )
                        for og in prod.option_groups
                    ]
                    payload = ProductCreate(
                        restaurant_id=restaurant_id,
                        name=prod.name,
                        description=prod.description,
                        price_cents=prod.price_cents,
                        category_ids=[created_cat.id],
                    )
                    created_prod = self._menu_repo.add_product(payload)
                    products_created += 1
                    for og in option_groups:
                        self._menu.add_option_group(restaurant_id, created_prod.id, og)
            self._restaurants.update(
                restaurant_id,
                RestaurantUpdate(original_language=extraction.detected_language),
            )
            self._set_job_status(
                job_id,
                status="completed",
                result_json={
                    "categories_created": categories_created,
                    "products_created": products_created,
                },
            )
        except Exception as exc:
            logger.exception("extract_menu job failed")
            self._set_job_status(job_id, status="failed", error_message=str(exc))

    def run_optimize_menu(self, job_id: uuid.UUID, restaurant_id: uuid.UUID) -> None:
        job = self.get_job(restaurant_id, job_id)
        if job.status not in {"pending", "processing"}:
            return
        self._set_job_status(job_id, status="processing")
        try:
            products_optimized = 0
            images_optimized = 0
            cursor: str | None = None
            while True:
                page = self._menu_repo.list_products(
                    restaurant_id,
                    PaginationParams(limit=MAX_LIMIT, cursor=cursor),
                )
                for product in page.items:
                    if product.description:
                        optimized = self._gateway.optimize_description(
                            product.description,
                            context=product.name,
                        )
                        self._artifacts.add(
                            AIArtifactCreate(
                                restaurant_id=restaurant_id,
                                entity_type="product",
                                entity_id=product.id,
                                field="description",
                                original_value=product.description,
                                optimized_value=optimized,
                            )
                        )
                        self._menu.update_product(
                            restaurant_id,
                            product.id,
                            ProductUpdate(description=optimized),
                        )
                        products_optimized += 1
                    if product.image_path:
                        try:
                            image_bytes = self._storage.read(product.image_path)
                            optimized_bytes = self._gateway.optimize_image(
                                image_bytes, "image/jpeg"
                            )
                            new_path = (
                                f"restaurants/{restaurant_id}/products/"
                                f"{product.id}/optimized.jpg"
                            )
                            self._storage.upload(
                                new_path, optimized_bytes, "image/jpeg", upsert=True
                            )
                            self._artifacts.add(
                                AIArtifactCreate(
                                    restaurant_id=restaurant_id,
                                    entity_type="product",
                                    entity_id=product.id,
                                    field="image_path",
                                    original_value=product.image_path,
                                    optimized_value=new_path,
                                )
                            )
                            self._menu.update_product(
                                restaurant_id,
                                product.id,
                                ProductUpdate(image_path=new_path),
                            )
                            images_optimized += 1
                        except Exception:
                            logger.warning(
                                "Skipping image optimization for product %s",
                                product.id,
                                exc_info=True,
                            )
                if not page.has_more:
                    break
                cursor = page.next_cursor
            self._set_job_status(
                job_id,
                status="completed",
                result_json={
                    "products_optimized": products_optimized,
                    "images_optimized": images_optimized,
                },
            )
        except Exception as exc:
            logger.exception("optimize_menu job failed")
            self._set_job_status(job_id, status="failed", error_message=str(exc))

    def run_pick_palette(self, job_id: uuid.UUID, restaurant_id: uuid.UUID) -> None:
        job = self.get_job(restaurant_id, job_id)
        if job.status not in {"pending", "processing"}:
            return
        self._set_job_status(job_id, status="processing")
        try:
            restaurant = self._restaurants.get(restaurant_id)
            if restaurant is None:
                raise NotFoundError("Restaurant not found")
            logo_bytes = None
            if restaurant.logo_path:
                try:
                    logo_bytes = self._storage.read(restaurant.logo_path)
                except Exception:
                    logo_bytes = None
            palette = self._gateway.pick_palette(
                logo_bytes=logo_bytes,
                brand_name=restaurant.name,
                palettes=AVAILABLE_PALETTES,
            )
            self._restaurants.update(restaurant_id, RestaurantUpdate(color_palette=palette))
            self._set_job_status(
                job_id,
                status="completed",
                result_json={"palette": palette},
            )
        except Exception as exc:
            logger.exception("pick_palette job failed")
            self._set_job_status(job_id, status="failed", error_message=str(exc))

    def revert_artifact(
        self, restaurant_id: uuid.UUID, artifact_id: uuid.UUID
    ) -> AIArtifactDTO:
        artifact = self._artifacts.get(restaurant_id, artifact_id)
        if artifact is None:
            raise NotFoundError("Artifact not found")
        if artifact.status == "reverted":
            raise ConflictError("Artifact already reverted")
        if artifact.entity_type != "product":
            raise ConflictError("Only product artifacts can be reverted in MVP")
        if artifact.field == "description":
            self._menu.update_product(
                restaurant_id,
                artifact.entity_id,
                ProductUpdate(description=artifact.original_value),
            )
        elif artifact.field == "image_path":
            self._menu.update_product(
                restaurant_id,
                artifact.entity_id,
                ProductUpdate(image_path=artifact.original_value),
            )
        else:
            raise ConflictError(f"Cannot revert field {artifact.field}")
        reverted = self._artifacts.mark_reverted(artifact_id)
        if reverted is None:
            raise NotFoundError("Artifact not found")
        return reverted


def compute_source_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
