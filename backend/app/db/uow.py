from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from types import TracebackType

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.infra.redis.composite_idempotency import CompositeIdempotencyRepository
from app.infra.redis.factory import build_cache
from app.infra.repositories.idempotency import SqlAlchemyIdempotencyRepository
from app.modules.assistant.adapters import SqlAlchemyAssistantRepository
from app.modules.assistant.entitlements.adapters import SqlAlchemyEntitlementOverridesRepository
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.usage.adapters import SqlAlchemyAssistantUsageRepository
from app.modules.delivery_providers.adapters import SqlAlchemyDeliveryProviderRepository
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.promotions.adapters import SqlAlchemyPromotionRepository
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.translations.adapters import SqlAlchemyTranslationRepository
from app.modules.users.adapters import SqlAlchemyUserRepository


class UnitOfWork(ABC):
    @abstractmethod
    def __enter__(self) -> UnitOfWork: ...

    @abstractmethod
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def rollback(self) -> None: ...


class SqlAlchemyUnitOfWork(UnitOfWork):
    def __init__(self, session_factory: sessionmaker[Session] = SessionLocal) -> None:
        self._session_factory = session_factory

    def __enter__(self) -> SqlAlchemyUnitOfWork:
        self.session = self._session_factory()
        settings = get_settings()
        cache = build_cache(settings)
        db_idempotency = SqlAlchemyIdempotencyRepository(self.session)
        self.restaurants = SqlAlchemyRestaurantRepository(self.session)
        self.delivery_providers = SqlAlchemyDeliveryProviderRepository(self.session)
        self.users = SqlAlchemyUserRepository(self.session)
        self.menu = SqlAlchemyMenuRepository(self.session)
        self.orders = SqlAlchemyOrderRepository(self.session)
        self.promotions = SqlAlchemyPromotionRepository(self.session)
        self.translations = SqlAlchemyTranslationRepository(self.session)
        self.assistant = SqlAlchemyAssistantRepository(self.session)
        self.assistant_profiles = SqlAlchemyAssistantProfileRepository(self.session)
        self.assistant_entitlements = SqlAlchemyEntitlementOverridesRepository(self.session)
        self.assistant_usage = SqlAlchemyAssistantUsageRepository(self.session)
        self.idempotency = CompositeIdempotencyRepository(
            cache,
            db_idempotency,
            redis_ttl_seconds=settings.order_idempotency_ttl_seconds,
        )
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            if exc_type is not None:
                self.rollback()
        finally:
            self.session.close()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()


def get_uow() -> Iterator[SqlAlchemyUnitOfWork]:
    with SqlAlchemyUnitOfWork() as uow:
        yield uow
        uow.commit()
