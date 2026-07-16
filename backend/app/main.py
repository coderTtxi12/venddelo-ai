from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import re

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.request_context import RequestIdMiddleware
from app.infra.llm.factory import build_llm_provider
from app.infra.llm.tracing import flush_langsmith_traces, log_tracing_status
from app.infra.realtime.digital_menu_hub import get_digital_menu_realtime_hub
from app.infra.realtime.order_hub import get_order_realtime_hub
from app.middleware.rate_limit import RateLimitMiddleware


def _menu_cors_origin_regex(menu_public_domain: str) -> str:
    escaped_domain = re.escape(menu_public_domain)
    return (
        rf"https?://([a-z0-9-]+\.)?localhost(:\d+)?|"
        rf"https://[a-z0-9](-?[a-z0-9])*\.{escaped_domain}"
    )


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    log_tracing_status()
    build_llm_provider(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        import asyncio

        loop = asyncio.get_running_loop()
        get_order_realtime_hub().bind_loop(loop)
        get_digital_menu_realtime_hub().bind_loop(loop)
        yield
        flush_langsmith_traces()
        await get_order_realtime_hub().shutdown()
        await get_digital_menu_realtime_hub().shutdown()

    app = FastAPI(title="Vendelo AI API", version=settings.app_version, lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=_menu_cors_origin_regex(settings.menu_public_domain),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
