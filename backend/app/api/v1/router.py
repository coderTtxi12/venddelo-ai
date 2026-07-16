from fastapi import APIRouter

from app.modules.analytics.api import router as analytics_router
from app.modules.assistant.api import router as assistant_router
from app.modules.delivery_providers.api import router as delivery_providers_router
from app.modules.health.api import router as health_router
from app.modules.menu.api import router as menu_router
from app.modules.menu.ws import router as menu_ws_router
from app.modules.orders.api import router as orders_router
from app.modules.orders.ws import router as orders_ws_router
from app.modules.promotions.api import router as promotions_router
from app.modules.public.api import router as public_router
from app.modules.restaurants.api import router as restaurants_router
from app.modules.users.api import router as users_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(delivery_providers_router)
api_v1_router.include_router(restaurants_router)
api_v1_router.include_router(menu_router)
api_v1_router.include_router(promotions_router)
api_v1_router.include_router(orders_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(orders_ws_router)
api_v1_router.include_router(menu_ws_router)
api_v1_router.include_router(assistant_router)
api_v1_router.include_router(public_router)
