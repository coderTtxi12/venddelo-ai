from __future__ import annotations

from app.core.storage import StorageError, StoragePort
from app.db.models.delivery import DeliveryDispatchRequest, DeliveryDriver
from app.db.models.restaurant import Restaurant
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
    customer_total_cents = row.collect_cents + max(0, row.quoted_fee_cents)
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
        collect_cents=customer_total_cents if show_collect else None,
        cash_denomination_cents=(
            row.cash_denomination_cents if row.payment_method == "cash" else None
        ),
    )
