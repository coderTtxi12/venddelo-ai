from __future__ import annotations

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session, sessionmaker

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.ai.openai_gateway import build_ai_gateway
from app.infra.storage.factory import build_storage
from app.modules.ai.adapters import SqlAlchemyAIArtifactRepository
from app.modules.ai.job_adapters import SqlAlchemyAIJobRepository
from app.modules.ai.service import AIService
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository


def _run_with_uow(
    session_factory: sessionmaker[Session],
    restaurant_id: uuid.UUID,
    job_id: uuid.UUID,
    runner: Callable[[AIService, uuid.UUID, uuid.UUID], None],
    *,
    invalidate_cache: bool = False,
) -> None:
    with SqlAlchemyUnitOfWork(session_factory) as uow:
        service = AIService(
            gateway=build_ai_gateway(),
            storage=build_storage(),
            jobs=SqlAlchemyAIJobRepository(uow.session),
            artifacts=SqlAlchemyAIArtifactRepository(uow.session),
            menu_repo=SqlAlchemyMenuRepository(uow.session),
            restaurants=SqlAlchemyRestaurantRepository(uow.session),
        )
        try:
            runner(service, job_id, restaurant_id)
            uow.commit()
            if invalidate_cache:
                invalidate_restaurant_menu_cache(uow, restaurant_id)
        except Exception:
            uow.rollback()
            raise


def run_extract_menu_job(
    session_factory: sessionmaker[Session],
    restaurant_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    _run_with_uow(
        session_factory,
        restaurant_id,
        job_id,
        lambda svc, jid, rid: svc.run_extract_menu(jid, rid),
        invalidate_cache=True,
    )


def run_optimize_menu_job(
    session_factory: sessionmaker[Session],
    restaurant_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    _run_with_uow(
        session_factory,
        restaurant_id,
        job_id,
        lambda svc, jid, rid: svc.run_optimize_menu(jid, rid),
        invalidate_cache=True,
    )


def run_pick_palette_job(
    session_factory: sessionmaker[Session],
    restaurant_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    _run_with_uow(
        session_factory,
        restaurant_id,
        job_id,
        lambda svc, jid, rid: svc.run_pick_palette(jid, rid),
    )
