from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.storage import StorageError, StoragePort
from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from app.db.models.restaurant import Restaurant
from app.infra.realtime.tracking_hub import get_tracking_realtime_hub
from app.infra.storage.factory import build_storage
from app.modules.delivery_dispatch.geo import geodesic_meters
from app.modules.delivery_dispatch.schemas import (
    PublicDispatchTrackingDTO,
    TrackingDropoffDTO,
    TrackingPickupDTO,
    TrackingRiderDTO,
)

LIVE_TRACKING_STATUSES = frozenset({"assigned", "picked_up", "in_transit"})
ETA_SPEED_MPS = 8


def public_plate_suffix(plate: str) -> str:
    cleaned = "".join(ch for ch in plate.strip().upper() if ch.isalnum())
    if not cleaned:
        return ""
    return cleaned[-3:]


def tracking_eta_seconds(
    status: str,
    *,
    rider_lat: float | None,
    rider_lng: float | None,
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float,
    dropoff_lng: float,
) -> int | None:
    if rider_lat is None or rider_lng is None:
        return None
    dest_lat, dest_lng = dropoff_lat, dropoff_lng
    if status == "assigned":
        if pickup_lat is None or pickup_lng is None:
            return None
        dest_lat, dest_lng = pickup_lat, pickup_lng
    elif status not in {"picked_up", "in_transit"}:
        return None
    return round(geodesic_meters(rider_lat, rider_lng, dest_lat, dest_lng) / ETA_SPEED_MPS)


def build_tracking_rider_dto(
    driver: DeliveryDriver | None,
    storage: StoragePort,
) -> TrackingRiderDTO | None:
    if driver is None:
        return None
    photo_url = None
    try:
        photo_url = storage.get_public_url(driver.profile_photo_path)
    except StorageError:
        photo_url = None
    return TrackingRiderDTO(
        first_name=driver.first_name,
        photo_url=photo_url,
        plate_suffix=public_plate_suffix(driver.plate),
        vehicle_type="moto",
        motorcycle_brand=driver.motorcycle_brand,
        motorcycle_color=driver.motorcycle_color,
        latitude=driver.last_lat,
        longitude=driver.last_lng,
        phone=driver.phone.strip(),
    )


def build_public_tracking_dto(
    row: DeliveryDispatchRequest,
    *,
    driver: DeliveryDriver | None,
    restaurant: Restaurant | None,
    storage: StoragePort,
) -> PublicDispatchTrackingDTO:
    pickup = None
    if (
        restaurant is not None
        and restaurant.latitude is not None
        and restaurant.longitude is not None
    ):
        pickup = TrackingPickupDTO(
            latitude=restaurant.latitude,
            longitude=restaurant.longitude,
            name=restaurant.name,
        )

    rider = build_tracking_rider_dto(driver, storage)

    show_collect = row.payment_method in {"cash", "card_terminal"}
    return PublicDispatchTrackingDTO(
        status=row.status,
        short_id=row.short_id,
        restaurant_name=restaurant.name if restaurant is not None else None,
        customer_name=row.customer_name,
        pickup=pickup,
        dropoff=TrackingDropoffDTO(
            latitude=row.dropoff_lat,
            longitude=row.dropoff_lng,
            address=row.dropoff_address,
        ),
        rider=rider,
        eta_seconds=tracking_eta_seconds(
            row.status,
            rider_lat=driver.last_lat if driver is not None else None,
            rider_lng=driver.last_lng if driver is not None else None,
            pickup_lat=pickup.latitude if pickup is not None else None,
            pickup_lng=pickup.longitude if pickup is not None else None,
            dropoff_lat=row.dropoff_lat,
            dropoff_lng=row.dropoff_lng,
        ),
        package_count=row.package_count,
        payment_method=row.payment_method,
        collect_cents=row.collect_cents if show_collect else None,
        cash_denomination_cents=(
            row.cash_denomination_cents if row.payment_method == "cash" else None
        ),
    )


def emit_public_tracking_snapshot(
    session: Session,
    request: DeliveryDispatchRequest,
    storage: StoragePort | None = None,
) -> None:
    driver = None
    if request.assigned_driver_id is not None:
        driver = session.get(DeliveryDriver, request.assigned_driver_id)
    restaurant = session.get(Restaurant, request.restaurant_id)
    dto = build_public_tracking_dto(
        request,
        driver=driver,
        restaurant=restaurant,
        storage=storage or build_storage(),
    )
    get_tracking_realtime_hub().publish_sync(
        request.tracking_token,
        {"type": "tracking.updated", "tracking": dto.model_dump(mode="json")},
    )


def emit_public_tracking_location(session: Session, driver: DeliveryDriver) -> None:
    if driver.last_lat is None or driver.last_lng is None:
        return
    rows = list(
        session.scalars(
            select(DeliveryDispatchRequest).where(
                DeliveryDispatchRequest.assigned_driver_id == driver.id,
                DeliveryDispatchRequest.status.in_(tuple(LIVE_TRACKING_STATUSES)),
            )
        ).all()
    )
    for row in rows:
        restaurant = session.get(Restaurant, row.restaurant_id)
        pickup_lat = restaurant.latitude if restaurant is not None else None
        pickup_lng = restaurant.longitude if restaurant is not None else None
        get_tracking_realtime_hub().publish_sync(
            row.tracking_token,
            {
                "type": "tracking.location",
                "latitude": driver.last_lat,
                "longitude": driver.last_lng,
                "eta_seconds": tracking_eta_seconds(
                    row.status,
                    rider_lat=driver.last_lat,
                    rider_lng=driver.last_lng,
                    pickup_lat=pickup_lat,
                    pickup_lng=pickup_lng,
                    dropoff_lat=row.dropoff_lat,
                    dropoff_lng=row.dropoff_lng,
                ),
            },
        )
