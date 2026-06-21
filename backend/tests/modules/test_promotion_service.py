from app.modules.promotions.schemas import PromotionBundle, PromotionCreate, PromotionScheduleInput, PromotionUpdate
from app.modules.promotions.service import PromotionService


class _FakeRepo:
    pass


def test_validate_create_nxm_requires_targets():
    svc = PromotionService(_FakeRepo())
    data = PromotionCreate(
        restaurant_id="00000000-0000-0000-0000-000000000001",
        name="2x1",
        type="bundle",
        scope="product",
        bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
    )
    try:
        svc._validate(data)
        assert False, "expected ValidationError"
    except Exception as exc:
        assert "require at least one product or category" in str(exc)


def test_validate_update_nxm_with_product_ids():
    svc = PromotionService(_FakeRepo())
    data = PromotionUpdate(
        name="2x1",
        type="bundle",
        scope="product",
        bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
        product_ids=["00000000-0000-0000-0000-000000000002"],
        schedule=PromotionScheduleInput(
            weekdays=[0, 1],
            use_time_window=True,
            daily_start_time="10:00",
            daily_end_time="14:00",
        ),
    )
    svc._validate(data)


def test_validate_update_nxm_schedule_without_targets():
    svc = PromotionService(_FakeRepo())
    data = PromotionUpdate(
        name="2x1",
        type="bundle",
        scope="product",
        bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
        schedule=PromotionScheduleInput(
            weekdays=[0, 1],
            use_time_window=True,
            daily_start_time="10:00",
            daily_end_time="14:00",
        ),
    )
    svc._validate(data)
