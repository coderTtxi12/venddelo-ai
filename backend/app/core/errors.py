from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_context import get_request_id


def _error_body(code: str, message: str) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": get_request_id(),
        }
    }


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    status_code = exc.status_code if isinstance(exc, StarletteHTTPException) else 500
    detail = exc.detail if isinstance(exc, StarletteHTTPException) else "HTTP error"
    return JSONResponse(
        status_code=status_code,
        content=_error_body("http_error", str(detail)),
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_error_body("validation_error", "Request validation failed"),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_error_body("internal_error", "Internal server error"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
