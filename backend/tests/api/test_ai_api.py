import uuid
from io import BytesIO

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_extract_menu_job_flow(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        r = uow.restaurants.add(
            RestaurantCreate(name="AI API", subdomain="aiapi", status="published"),
            owner_id=OWNER,
        )
        uow.commit()

    files = {"file": ("menu.pdf", BytesIO(b"fake-menu"), "application/pdf")}
    resp = client.post(
        f"/api/v1/restaurants/{r.id}/ai/jobs/extract-menu",
        files=files,
        headers=AUTH,
    )
    assert resp.status_code == 202
    job_id = resp.json()["id"]

    job_resp = client.get(
        f"/api/v1/restaurants/{r.id}/ai/jobs/{job_id}",
        headers=AUTH,
    )
    assert job_resp.status_code == 200
    assert job_resp.json()["status"] == "completed"
    assert job_resp.json()["result_json"]["products_created"] == 3


@requires_db
def test_public_menu_translation(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        r = uow.restaurants.add(
            RestaurantCreate(name="Tr", subdomain="tr-pub", status="published"),
            owner_id=OWNER,
        )
        cat = uow.menu.add_category(CategoryCreate(restaurant_id=r.id, name="Platos"))
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=r.id,
                name="Taco",
                description="Rico",
                price_cents=500,
                approval_status="approved",
                is_published=True,
                category_ids=[cat.id],
            )
        )
        uow.commit()

    menu_resp = client.get("/api/v1/public/menu/tr-pub?locale=en")
    assert menu_resp.status_code == 200
    assert menu_resp.json()["products"][0]["name"].startswith("[en]")


@requires_db
def test_pick_palette_job(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        r = uow.restaurants.add(
            RestaurantCreate(name="Palette", subdomain="palette"),
            owner_id=OWNER,
        )
        uow.commit()

    resp = client.post(
        f"/api/v1/restaurants/{r.id}/ai/jobs/pick-palette",
        headers=AUTH,
    )
    assert resp.status_code == 202
    job_id = resp.json()["id"]
    job = client.get(
        f"/api/v1/restaurants/{r.id}/ai/jobs/{job_id}",
        headers=AUTH,
    ).json()
    assert job["status"] == "completed"
    assert job["result_json"]["palette"] in {
        "sunset",
        "ocean",
        "forest",
        "classic",
        "terracotta",
    }
