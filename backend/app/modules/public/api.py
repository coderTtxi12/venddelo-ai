from fastapi import APIRouter, Depends, Header, status

from app.core.exceptions import NotFoundError
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderDTO, PublicOrderInput
from app.modules.orders.service import OrderService

router = APIRouter(prefix="/public", tags=["public"])


def _menu_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> MenuService:
    return MenuService(uow.menu)


def _order_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> OrderService:
    return OrderService(
        uow.orders,
        uow.restaurants,
        uow.menu,
        uow.idempotency,
    )


@router.get("/menu/{subdomain}", response_model=FullMenuDTO)
def get_public_menu(
    subdomain: str,
    menu_service: MenuService = Depends(_menu_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> FullMenuDTO:
    restaurant = uow.restaurants.get_by_subdomain(subdomain)
    if restaurant is None or restaurant.status != "published":
        raise NotFoundError("Restaurant not found")
    return menu_service.get_full_menu(restaurant.id)


@router.post(
    "/menu/{subdomain}/orders",
    response_model=OrderDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_public_order(
    subdomain: str,
    data: PublicOrderInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    service: OrderService = Depends(_order_service),
) -> OrderDTO:
    return service.create_public(subdomain, data, idempotency_key)
