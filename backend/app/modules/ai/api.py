import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, status

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.api.deps import require_owned_restaurant
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.ai.openai_gateway import build_ai_gateway
from app.infra.storage.factory import build_storage
from app.modules.ai.background import (
    run_extract_menu_job,
    run_optimize_menu_job,
    run_pick_palette_job,
)
from app.modules.ai.schemas import AIArtifactDTO, AIJobDTO
from app.modules.ai.service import AIService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["ai"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> AIService:
    return AIService(
        gateway=build_ai_gateway(),
        storage=build_storage(),
        jobs=uow.ai_jobs,
        artifacts=uow.ai_artifacts,
        menu_repo=uow.menu,
        restaurants=uow.restaurants,
    )


@router.post(
    "/restaurants/{restaurant_id}/ai/jobs/extract-menu",
    response_model=AIJobDTO,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_extract_menu(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> AIJobDTO:
    content = file.file.read()
    content_type = file.content_type or "application/octet-stream"
    ext = "bin"
    if content_type == "application/pdf":
        ext = "pdf"
    elif content_type.startswith("image/"):
        ext = content_type.split("/")[-1]
    path = f"restaurants/{restaurant.id}/uploads/menu-{uuid.uuid4()}.{ext}"
    build_storage().upload(path, content, content_type)
    job = service.create_extract_job(restaurant.id, storage_path=path)
    background_tasks.add_task(
        run_extract_menu_job,
        uow._session_factory,
        restaurant.id,
        job.id,
    )
    uow.commit()
    return job


@router.post(
    "/restaurants/{restaurant_id}/ai/jobs/optimize-menu",
    response_model=AIJobDTO,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_optimize_menu(
    background_tasks: BackgroundTasks,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> AIJobDTO:
    job = service.create_optimize_job(restaurant.id)
    background_tasks.add_task(
        run_optimize_menu_job,
        uow._session_factory,
        restaurant.id,
        job.id,
    )
    uow.commit()
    return job


@router.post(
    "/restaurants/{restaurant_id}/ai/jobs/pick-palette",
    response_model=AIJobDTO,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_pick_palette(
    background_tasks: BackgroundTasks,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> AIJobDTO:
    job = service.create_pick_palette_job(restaurant.id)
    background_tasks.add_task(
        run_pick_palette_job,
        uow._session_factory,
        restaurant.id,
        job.id,
    )
    uow.commit()
    return job


@router.get(
    "/restaurants/{restaurant_id}/ai/jobs/{job_id}",
    response_model=AIJobDTO,
)
def get_ai_job(
    job_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
) -> AIJobDTO:
    return service.get_job(restaurant.id, job_id)


@router.get(
    "/restaurants/{restaurant_id}/ai/artifacts",
    response_model=list[AIArtifactDTO],
)
def list_ai_artifacts(
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
) -> list[AIArtifactDTO]:
    return service.list_artifacts(restaurant.id)


@router.post(
    "/restaurants/{restaurant_id}/ai/artifacts/{artifact_id}/revert",
    response_model=AIArtifactDTO,
)
def revert_ai_artifact(
    artifact_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: AIService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> AIArtifactDTO:
    dto = service.revert_artifact(restaurant.id, artifact_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto
