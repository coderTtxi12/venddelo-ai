from datetime import time

from sqlalchemy import select

from app.db.models import (
    AIArtifact,
    Category,
    MenuTranslation,
    OptionGroup,
    OptionItem,
    Order,
    OrderItem,
    Product,
    Promotion,
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)
from app.db.models.promotions import promotion_products
from app.db.session import SessionLocal

DEMO_SUBDOMAIN = "demo"


def seed() -> None:
    session = SessionLocal()
    try:
        existing = session.scalar(select(Restaurant).where(Restaurant.subdomain == DEMO_SUBDOMAIN))
        if existing is not None:
            print("Seed skipped: demo restaurant already exists")
            return

        restaurant = Restaurant(
            name="Demo Restaurant",
            subdomain=DEMO_SUBDOMAIN,
            original_language="es",
            status="published",
            address="Demo Street 123",
        )
        session.add(restaurant)
        session.flush()

        session.add_all(
            [
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="takeout",
                    day_of_week=0,
                    opens_at=time(8, 0),
                    closes_at=time(14, 0),
                ),
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="takeout",
                    day_of_week=0,
                    opens_at=time(18, 0),
                    closes_at=time(23, 0),
                ),
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="delivery",
                    day_of_week=0,
                    opens_at=time(18, 0),
                    closes_at=time(23, 0),
                ),
            ]
        )

        for method in ("cash", "transfer", "card_terminal"):
            for service in ("takeout", "delivery"):
                session.add(
                    RestaurantPaymentMethod(
                        restaurant_id=restaurant.id,
                        method=method,
                        service_type=service,
                    )
                )

        tacos = Category(restaurant_id=restaurant.id, name="Tacos", sort_index=0)
        drinks = Category(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
        session.add_all([tacos, drinks])
        session.flush()

        pastor = Product(
            restaurant_id=restaurant.id,
            name="Taco al Pastor",
            description="Marinated pork taco",
            price_cents=2500,
            approval_status="approved",
            is_published=True,
        )
        pastor.categories.append(tacos)
        suadero = Product(
            restaurant_id=restaurant.id,
            name="Taco de Suadero",
            price_cents=2500,
            approval_status="approved",
            is_published=True,
        )
        suadero.categories.append(tacos)
        agua = Product(
            restaurant_id=restaurant.id,
            name="Agua de Horchata",
            price_cents=2000,
            approval_status="approved",
            is_published=True,
        )
        agua.categories.append(drinks)
        session.add_all([pastor, suadero, agua])
        session.flush()

        size = OptionGroup(
            product_id=pastor.id,
            title="Tamaño",
            required=True,
            selection="single",
            min_selections=1,
            max_selections=1,
        )
        size.items.append(OptionItem(label="Normal", price_delta_cents=0))
        size.items.append(OptionItem(label="Grande", price_delta_cents=1000))
        extras = OptionGroup(
            product_id=pastor.id,
            title="Extras",
            required=False,
            selection="multi",
            min_selections=0,
        )
        extras.items.append(OptionItem(label="Queso", price_delta_cents=1500))
        extras.items.append(OptionItem(label="Piña", price_delta_cents=0))
        session.add_all([size, extras])

        promo = Promotion(
            restaurant_id=restaurant.id,
            name="10% en Pastor",
            type="percent",
            percent=10,
            scope="product",
        )
        session.add(promo)
        session.flush()
        session.execute(
            promotion_products.insert().values(promotion_id=promo.id, product_id=pastor.id)
        )

        order = Order(
            restaurant_id=restaurant.id,
            type="delivery",
            customer_name="Juan Perez",
            customer_phone="5550001111",
            delivery_address="Calle Falsa 123",
            payment_method="cash",
            subtotal_cents=5000,
            total_cents=5000,
            status="pending",
        )
        order.items.append(
            OrderItem(
                product_id=pastor.id,
                product_name="Taco al Pastor",
                quantity=2,
                unit_price_cents=2500,
                selected_options={"Tamaño": "Normal", "Extras": ["Piña"]},
                line_total_cents=5000,
            )
        )
        session.add(order)

        session.add(
            AIArtifact(
                restaurant_id=restaurant.id,
                entity_type="product",
                entity_id=pastor.id,
                field="description",
                original_value="taco pastor",
                optimized_value="Marinated pork taco",
                status="applied",
            )
        )
        session.add(
            MenuTranslation(
                restaurant_id=restaurant.id,
                locale="en",
                entity_type="product",
                entity_id=pastor.id,
                field="name",
                translated_text="Al Pastor Taco",
                source_hash="seedhash",
            )
        )

        session.commit()
        print(f"Seed complete: restaurant {restaurant.id} ({DEMO_SUBDOMAIN})")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
