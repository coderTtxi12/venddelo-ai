import uuid
from datetime import UTC, datetime

from app.infra.cache.menu_cache import sanitize_public_menu
from app.modules.menu.schemas import FullMenuDTO, ProductDTO


def _product(**kwargs) -> ProductDTO:
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Tacos",
        price_cents=1000,
        currency="MXN",
        status="active",
        created_at=now,
        updated_at=now,
        inventory_qty=2,
        shelf_life_days=1,
        expires_on=None,
        batch_started_at=now,
        show_low_stock=False,
    )
    defaults.update(kwargs)
    return ProductDTO(**defaults)


def test_sanitize_public_menu_exposes_stock_when_live_inventory_on():
    product = _product()
    menu = FullMenuDTO(restaurant_id=product.restaurant_id, categories=[], products=[product])

    public = sanitize_public_menu(
        menu,
        live_menu_inventory_enabled=True,
        low_stock_threshold=3,
    )
    out = public.products[0]
    assert out.show_low_stock is True
    assert out.inventory_qty == 2
    assert out.shelf_life_days is None
    assert out.expires_on is None
    assert out.batch_started_at is None


def test_sanitize_public_menu_off_never_shows_urgency():
    product = _product(inventory_qty=1)
    menu = FullMenuDTO(restaurant_id=product.restaurant_id, categories=[], products=[product])

    public = sanitize_public_menu(
        menu,
        live_menu_inventory_enabled=False,
        low_stock_threshold=3,
    )
    assert public.products[0].show_low_stock is False
    assert public.products[0].inventory_qty is None
