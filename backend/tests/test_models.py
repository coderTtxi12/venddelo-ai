import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    Category,
    OptionGroup,
    OptionItem,
    Product,
    Restaurant,
)
from tests.conftest import requires_db


@requires_db
def test_restaurant_unique_subdomain(session):
    session.add(Restaurant(name="A", subdomain="dup"))
    session.commit()
    session.add(Restaurant(name="B", subdomain="dup"))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


@requires_db
def test_product_category_m2n(session):
    r = Restaurant(name="R", subdomain="m2n")
    session.add(r)
    session.flush()
    cat = Category(restaurant_id=r.id, name="Tacos")
    prod = Product(restaurant_id=r.id, name="Pastor", price_cents=1200)
    prod.categories.append(cat)
    session.add_all([cat, prod])
    session.commit()

    loaded = session.get(Product, prod.id)
    assert [c.name for c in loaded.categories] == ["Tacos"]


@requires_db
def test_option_group_cascade_on_product_delete(session):
    r = Restaurant(name="R", subdomain="casc")
    session.add(r)
    session.flush()
    prod = Product(restaurant_id=r.id, name="Combo", price_cents=999)
    grp = OptionGroup(title="Size", selection="single", product=prod)
    grp.items.append(OptionItem(label="Large", price_delta_cents=300))
    session.add_all([prod, grp])
    session.commit()

    session.delete(prod)
    session.commit()
    assert session.query(OptionGroup).count() == 0
    assert session.query(OptionItem).count() == 0


@requires_db
def test_check_constraint_rejects_bad_status(session):
    r = Restaurant(name="R", subdomain="chk")
    session.add(r)
    session.flush()
    session.add(
        Product(
            restaurant_id=r.id,
            name="X",
            price_cents=100,
            approval_status="bogus",
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


@requires_db
def test_money_is_integer_cents(session):
    r = Restaurant(name="R", subdomain="money")
    session.add(r)
    session.flush()
    p = Product(restaurant_id=r.id, name="P", price_cents=1599)
    session.add(p)
    session.commit()
    assert session.get(Product, p.id).price_cents == 1599
