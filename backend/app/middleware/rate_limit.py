from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.request_context import get_request_id
from app.infra.redis.factory import build_rate_limiter


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        settings = get_settings()
        public_prefix = f"{settings.api_v1_prefix}/public/"
        if not request.url.path.startswith(public_prefix):
            return await call_next(request)

        limiter = build_rate_limiter(settings)
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{client_ip}:{request.url.path}"

        if not limiter.is_allowed(
            key,
            limit=settings.rate_limit_requests,
            window_seconds=settings.rate_limit_window_seconds,
        ):
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": "Too many requests",
                        "request_id": get_request_id(),
                    }
                },
            )
        return await call_next(request)
