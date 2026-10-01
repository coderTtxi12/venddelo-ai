from datetime import UTC, datetime

from app.modules.menu.menu_schedule import is_product_menu_schedule_active
from app.modules.menu.schemas import ProductDTO, ProductMenuScheduleDTO
from app.modules.promotions.effective import resolve_timezone
import uuid


def _product(schedule: ProductMenuScheduleDTO | None) -> ProductDTO:
    now = datetime.now(UTC)
    return ProductDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Tacos",
        price_cents=1000,
        currency="MXN",
        status="active",
        menu_schedule=schedule,
        created_at=now,
        updated_at=now,
    )


def test_no_schedule_always_visible():
    tz = resolve_timezone("America/Mexico_City")
    product = _product(None)
    assert is_product_menu_schedule_active(product, datetime(2026, 3, 15, 12, 0, tzinfo=UTC), tz)


def test_weekday_restriction():
    tz = resolve_timezone("America/Mexico_City")
    # 2026-03-15 is Sunday (weekday 6)
    schedule = ProductMenuScheduleDTO(weekdays=[6], use_time_window=False)
    product = _product(schedule)
    sunday_noon = datetime(2026, 3, 15, 18, 0, tzinfo=UTC)
    monday_noon = datetime(2026, 3, 16, 18, 0, tzinfo=UTC)
    assert is_product_menu_schedule_active(product, sunday_noon, tz)
    assert not is_product_menu_schedule_active(product, monday_noon, tz)


def test_time_window():
    tz = resolve_timezone("America/Mexico_City")
    schedule = ProductMenuScheduleDTO(
        weekdays=[],
        use_time_window=True,
        daily_start_time="20:00",
        daily_end_time="23:00",
    )
    product = _product(schedule)
    evening = datetime(2026, 3, 15, 3, 0, tzinfo=UTC)  # 21:00 CDMX
    afternoon = datetime(2026, 3, 15, 20, 0, tzinfo=UTC)  # 14:00 CDMX
    assert is_product_menu_schedule_active(product, evening, tz)
    assert not is_product_menu_schedule_active(product, afternoon, tz)
