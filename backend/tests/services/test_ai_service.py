from app.core.pagination import PaginationParams
from app.infra.ai.stub_gateway import StubAIGateway
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.ai.adapters import SqlAlchemyAIArtifactRepository
from app.modules.ai.job_adapters import SqlAlchemyAIJobRepository
from app.modules.ai.schemas import AIArtifactCreate
from app.modules.ai.service import AIService, compute_source_hash
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import CategoryCreate, ProductCreate, ProductUpdate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _service(
    session, storage: MemoryStorageAdapter | None = None
) -> tuple[AIService, MemoryStorageAdapter]:
    mem = storage or MemoryStorageAdapter()
    svc = AIService(
        gateway=StubAIGateway(),
        storage=mem,
        jobs=SqlAlchemyAIJobRepository(session),
        artifacts=SqlAlchemyAIArtifactRepository(session),
        menu_repo=SqlAlchemyMenuRepository(session),
        restaurants=SqlAlchemyRestaurantRepository(session),
    )
    return svc, mem


@requires_db
def test_extract_menu_job_creates_catalog(session):
    r = SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="AI", subdomain="ai-extract")
    )
    svc, storage = _service(session)
    path = f"restaurants/{r.id}/uploads/menu.pdf"
    storage.upload(path, b"menu", "application/pdf")
    job = svc.create_extract_job(r.id, storage_path=path)
    svc.run_extract_menu(job.id, r.id)
    session.commit()
    job = svc.get_job(r.id, job.id)
    assert job.status == "completed"
    assert job.result_json["categories_created"] == 2
    assert job.result_json["products_created"] == 3
    menu = SqlAlchemyMenuRepository(session).list_products(r.id, PaginationParams(limit=100))
    assert len(menu.items) == 3


@requires_db
def test_revert_description_artifact(session):
    r = SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="Rev", subdomain="ai-revert")
    )
    menu_repo = SqlAlchemyMenuRepository(session)
    cat = menu_repo.add_category(CategoryCreate(restaurant_id=r.id, name="C"))
    prod = menu_repo.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="Taco",
            description="original",
            price_cents=500,
            category_ids=[cat.id],
        )
    )
    artifacts = SqlAlchemyAIArtifactRepository(session)
    artifact = artifacts.add(
        AIArtifactCreate(
            restaurant_id=r.id,
            entity_type="product",
            entity_id=prod.id,
            field="description",
            original_value="original",
            optimized_value="optimized",
        )
    )
    menu_repo.update_product(prod.id, ProductUpdate(description="optimized"))
    svc, _ = _service(session)
    reverted = svc.revert_artifact(r.id, artifact.id)
    assert reverted.status == "reverted"
    updated = menu_repo.get_product(prod.id)
    assert updated.description == "original"


def test_compute_source_hash_stable():
    assert compute_source_hash("hola") == compute_source_hash("hola")
    assert compute_source_hash("hola") != compute_source_hash("adios")
