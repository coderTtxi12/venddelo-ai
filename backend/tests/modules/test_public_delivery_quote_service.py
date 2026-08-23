import uuid
from datetime import UTC, datetime, time
from unittest.mock import MagicMock, patch

from app.modules.delivery_providers.schemas import (
    DeliveryProviderPricingConfigDTO,
    DeliveryProviderScheduleDTO,
    RestaurantDeliveryPartnershipDTO,
)
from app.modules.public.delivery_quote_service import (
    PublicDeliveryQuoteService,
    _format_resume_when,
    _service_reason,
)
from app.modules.restaurants.schemas import RestaurantDTO


def _restaurant(**overrides) -> RestaurantDTO:
    base = {
        "id": uuid.uuid4(),
        "name": "Tacos",
        "subdomain": "tacos",
        "status": "published",
        "takeout_enabled": True,
        "delivery_enabled": True,
        "latitude": 19.4326,
        "longitude": -99.1332,
        "original_language": "es",
        "timezone": "America/Mexico_City",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    base.update(overrides)
    return RestaurantDTO.model_validate(base)


def _schedule_slot(
    day: int,
    opens: str,
    closes: str,
    kind: str = "regular",
) -> DeliveryProviderScheduleDTO:
    return DeliveryProviderScheduleDTO(
        id=uuid.uuid4(),
        schedule_kind=kind,  # type: ignore[arg-type]
        day_of_week=day,
        opens_at=time.fromisoformat(opens),
        closes_at=time.fromisoformat(closes),
    )


def _pricing_config() -> DeliveryProviderPricingConfigDTO:
    from app.modules.delivery_providers.pricing import config_to_json, default_pricing_config

    parsed = default_pricing_config()
    payload = config_to_json(parsed)
    return DeliveryProviderPricingConfigDTO.model_validate(payload)


def _active_outside_quote_repo() -> MagicMock:
    repo = MagicMock()
    provider_id = uuid.uuid4()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        zone_id=uuid.uuid4(),
        status="active",
        is_default=True,
        created_at=datetime.now(),
        activated_at=datetime.now(),
    )

    repo.get_mexy_partnership_for_restaurant.return_value = partnership
    repo.get_mexy_provider_id.return_value = provider_id
    repo.list_schedules.return_value = [
        _schedule_slot(0, "09:00:00", "21:00:00", "regular"),
        _schedule_slot(0, "21:00:00", "22:00:00", "night"),
    ]
    repo.get_provider_timezone.return_value = "America/Mexico_City"
    repo.get_service_manually_enabled.return_value = True
    repo.get_weather_mode.return_value = "none"
    repo.get_pricing_config.return_value = _pricing_config()
    repo.point_in_zone.return_value = False
    return repo


def test_quote_delivery_blocks_outside_polygon_during_night_only_hours():
    repo = _active_outside_quote_repo()
    service = PublicDeliveryQuoteService(repo)
    # Monday 9:30 p.m. Mexico City
    now = datetime(2026, 6, 23, 3, 30, tzinfo=UTC)

    with (
        patch(
            "app.modules.public.delivery_quote_service.get_settings",
            return_value=MagicMock(google_maps_api_key="test-key"),
        ),
        patch(
            "app.modules.public.delivery_quote_service.fetch_driving_distance_km",
            return_value=5.0,
        ),
    ):
        quote = service.quote_delivery(
            _restaurant(),
            delivery_latitude=19.45,
            delivery_longitude=-99.12,
            now=now,
        )

    assert quote.available is False
    assert quote.inside_polygon is False
    assert "horario diurno" in (quote.reason or "").lower()


def test_quote_delivery_allows_outside_polygon_during_regular_hours():
    repo = _active_outside_quote_repo()
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    with (
        patch(
            "app.modules.public.delivery_quote_service.get_settings",
            return_value=MagicMock(google_maps_api_key="test-key"),
        ),
        patch(
            "app.modules.public.delivery_quote_service.fetch_driving_distance_km",
            return_value=5.0,
        ),
    ):
        quote = service.quote_delivery(
            _restaurant(),
            delivery_latitude=19.45,
            delivery_longitude=-99.12,
            now=now,
        )

    assert quote.available is True
    assert quote.inside_polygon is False
    assert quote.delivery_fee_cents == 6500
    assert quote.weather_mode == "none"


def test_quote_delivery_exposes_weather_mode():
    repo = _active_outside_quote_repo()
    repo.get_weather_mode.return_value = "heavy"
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    with (
        patch(
            "app.modules.public.delivery_quote_service.get_settings",
            return_value=MagicMock(google_maps_api_key="test-key"),
        ),
        patch(
            "app.modules.public.delivery_quote_service.fetch_driving_distance_km",
            return_value=5.0,
        ),
    ):
        quote = service.quote_delivery(
            _restaurant(),
            delivery_latitude=19.45,
            delivery_longitude=-99.12,
            now=now,
        )

    assert quote.weather_mode == "heavy"


def test_resolve_delivery_service_blocks_pending_partnership():
    repo = MagicMock()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        zone_id=uuid.uuid4(),
        status="pending",
        is_default=False,
        created_at=datetime.now(),
        activated_at=None,
    )
    repo.get_mexy_partnership_for_restaurant.return_value = partnership

    service = PublicDeliveryQuoteService(repo)
    resolved = service.resolve_delivery_service(_restaurant())

    assert resolved.available is False
    assert resolved.partnership_status == "pending"
    assert "aceptada" in (resolved.reason or "").lower()


def test_resolve_delivery_service_blocks_when_delivery_disabled():
    repo = MagicMock()
    service = PublicDeliveryQuoteService(repo)
    resolved = service.resolve_delivery_service(_restaurant(delivery_enabled=False))

    assert resolved.available is False
    assert resolved.partnership_status == "none"


def test_quote_delivery_uses_assigned_zone_for_point_in_zone():
    repo = _active_outside_quote_repo()
    zone_id = repo.get_mexy_partnership_for_restaurant.return_value.zone_id
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    with (
        patch(
            "app.modules.public.delivery_quote_service.get_settings",
            return_value=MagicMock(google_maps_api_key="test-key"),
        ),
        patch(
            "app.modules.public.delivery_quote_service.fetch_driving_distance_km",
            return_value=5.0,
        ),
    ):
        service.quote_delivery(
            _restaurant(),
            delivery_latitude=19.45,
            delivery_longitude=-99.12,
            now=now,
        )

    repo.point_in_zone.assert_called_once_with(zone_id, 19.45, -99.12)


def test_resolve_delivery_service_blocks_when_partnership_has_no_zone():
    repo = MagicMock()
    partnership = RestaurantDeliveryPartnershipDTO(
        id=uuid.uuid4(),
        provider_name="Mexy",
        provider_slug="mexy",
        zone_id=None,
        zone_name=None,
        status="active",
        is_default=True,
        created_at=datetime.now(),
        activated_at=datetime.now(),
    )
    repo.get_mexy_partnership_for_restaurant.return_value = partnership
    repo.get_mexy_provider_id.return_value = uuid.uuid4()

    service = PublicDeliveryQuoteService(repo)
    resolved = service.resolve_delivery_service(_restaurant())

    assert resolved.available is False
    assert resolved.partnership_status == "active"


def _active_service_repo(*, manually_enabled: bool) -> MagicMock:
    repo = _active_outside_quote_repo()
    repo.get_service_manually_enabled.return_value = manually_enabled
    repo.list_schedules.return_value = [
        _schedule_slot(0, "09:00:00", "21:00:00", "regular"),
    ]
    return repo


def test_service_reason_explains_manual_off():
    assert _service_reason("manual_off") == (
        "El servicio de reparto no está disponible en este momento. "
        "Mexy pausó las entregas temporalmente."
    )


def test_service_reason_explains_outside_schedule_with_resume_time():
    now = datetime(2026, 6, 22, 7, 0, tzinfo=UTC)
    next_change = datetime(2026, 6, 22, 15, 0, tzinfo=UTC)

    reason = _service_reason(
        "outside_schedule",
        next_change_at=next_change,
        timezone="America/Mexico_City",
        now=now,
    )

    assert reason.startswith("El servicio de reparto no está disponible en este momento.")
    assert "fuera del horario de operación" in reason
    assert "hoy a las 9:00 a.m." in reason


def test_format_resume_when_uses_tomorrow_and_weekday():
    timezone = "America/Mexico_City"
    sunday_night = datetime(2026, 6, 22, 5, 0, tzinfo=UTC)
    monday_open = datetime(2026, 6, 22, 15, 0, tzinfo=UTC)
    wednesday_open = datetime(2026, 6, 24, 15, 0, tzinfo=UTC)

    assert (
        _format_resume_when(monday_open, timezone=timezone, now=sunday_night)
        == "mañana a las 9:00 a.m."
    )
    assert (
        _format_resume_when(wednesday_open, timezone=timezone, now=sunday_night)
        == "el miércoles a las 9:00 a.m."
    )


def test_format_resume_when_uses_pm_and_singular_article():
    timezone = "America/Mexico_City"
    now = datetime(2026, 6, 22, 16, 0, tzinfo=UTC)
    evening = datetime(2026, 6, 23, 3, 0, tzinfo=UTC)
    one_pm = datetime(2026, 6, 22, 19, 0, tzinfo=UTC)

    assert _format_resume_when(evening, timezone=timezone, now=now) == "hoy a las 9:00 p.m."
    assert _format_resume_when(one_pm, timezone=timezone, now=now) == "hoy a la 1:00 p.m."


def test_resolve_delivery_service_explains_manual_off():
    repo = _active_service_repo(manually_enabled=False)
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    resolved = service.resolve_delivery_service(_restaurant(), now=now)

    assert resolved.available is False
    assert "pausó las entregas" in (resolved.reason or "")


def test_resolve_delivery_service_blocks_intense_weather():
    repo = _active_service_repo(manually_enabled=True)
    repo.get_weather_mode.return_value = "intense"
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    resolved = service.resolve_delivery_service(_restaurant(), now=now)

    assert resolved.available is False
    assert resolved.weather_mode == "intense"
    assert "lluvia intensa" in (resolved.reason or "").lower()


def test_resolve_delivery_service_exposes_light_weather_when_open():
    repo = _active_service_repo(manually_enabled=True)
    repo.get_weather_mode.return_value = "light"
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 18, 0, tzinfo=UTC)

    resolved = service.resolve_delivery_service(_restaurant(), now=now)

    assert resolved.available is True
    assert resolved.weather_mode == "light"


def test_resolve_delivery_service_explains_outside_schedule():
    repo = _active_service_repo(manually_enabled=True)
    service = PublicDeliveryQuoteService(repo)
    now = datetime(2026, 6, 22, 5, 0, tzinfo=UTC)

    resolved = service.resolve_delivery_service(_restaurant(), now=now)

    assert resolved.available is False
    assert "fuera del horario de operación" in (resolved.reason or "")
    assert "Reanuda" in (resolved.reason or "")
