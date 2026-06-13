# Phase 1 — Backend Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vendelo AI backend foundations — a runnable FastAPI app with env-based config, structured JSON logging, request-id correlation, uniform error handling, cursor pagination + idempotency contracts, and a SOLID `health` module exposing `GET /api/v1/health` — plus the monorepo restructure.

**Architecture:** Modular monolith with vertical slices by domain (`app/modules/<domain>/{api,service,ports,adapters,schemas}`) and a shared `app/core/`. Dependency Inversion throughout (services depend on ports, adapters implement them).

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2 + pydantic-settings, pip + venv, pytest, ruff, black, mypy, pre-commit.

---

## Conventions for every task

- Run all commands from `backend/` unless stated otherwise.
- TDD: write the failing test, run it (confirm fail), implement, run (confirm pass), commit.
- Package dirs need `__init__.py` (created in Task 2).
- Commit messages follow the repo's existing convention (`feat:`, `chore:`, `refactor:`, `test:`).

---

## Task 0: Monorepo restructure

**Files:**
- Rename: `frontend/` → `frontend-legacy/`
- Create: `infra/.gitkeep`

- [ ] **Step 1: Rename frontend with history preserved**

Run (from repo root):
```bash
git mv frontend frontend-legacy
```

- [ ] **Step 2: Create empty infra dir**

Run (from repo root):
```bash
mkdir -p infra && touch infra/.gitkeep
```

- [ ] **Step 3: Verify**

Run: `ls` (root)
Expected: `backend  docs  frontend-legacy  infra`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename frontend to frontend-legacy and add infra dir for monorepo"
```

---

## Task 1: Backend project files (no app code yet)

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/.dockerignore`
- Create: `backend/Dockerfile`
- Create: `backend/.pre-commit-config.yaml`
- Create: `backend/README.md`

- [ ] **Step 1: Create `backend/requirements.txt`**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pydantic-settings==2.7.1
```

- [ ] **Step 2: Create `backend/requirements-dev.txt`**

```
-r requirements.txt
pytest==8.3.4
httpx==0.28.1
ruff==0.8.6
black==24.10.0
mypy==1.14.1
pre-commit==4.0.1
```

> If any pinned version fails to resolve, install the nearest available and re-freeze; do not change the library set.

- [ ] **Step 3: Create `backend/pyproject.toml`**

```toml
[project]
name = "venddelo-ai-backend"
version = "0.1.0"
requires-python = ">=3.12"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.black]
line-length = 100
target-version = ["py312"]

[tool.mypy]
python_version = "3.12"
strict = true
ignore_missing_imports = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 4: Create `backend/.env.example`**

```
APP_ENV=dev
LOG_LEVEL=INFO
API_V1_PREFIX=/api/v1
APP_VERSION=0.1.0

# Added in later phases (do not uncomment until implemented):
# DATABASE_URL=
# REDIS_URL=
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# AI_PROVIDER_API_KEY=
```

- [ ] **Step 5: Create `backend/.gitignore`**

```
.venv/
__pycache__/
*.pyc
.env
.pytest_cache/
.mypy_cache/
.ruff_cache/
```

- [ ] **Step 6: Create `backend/.dockerignore`**

```
.venv
__pycache__
*.pyc
.env
tests
.pytest_cache
.mypy_cache
.ruff_cache
```

- [ ] **Step 7: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

- [ ] **Step 8: Create `backend/.pre-commit-config.yaml`**

```yaml
repos:
  - repo: local
    hooks:
      - id: ruff
        name: ruff
        entry: ruff check
        language: system
        types: [python]
      - id: black
        name: black
        entry: black --check
        language: system
        types: [python]
      - id: mypy
        name: mypy
        entry: mypy app
        language: system
        pass_filenames: false
        types: [python]
```

- [ ] **Step 9: Create `backend/README.md`**

```markdown
# venddelo-ai-backend

FastAPI backend for Vendelo AI (modular monolith, SOLID, microservices-ready).

## Setup

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8080
# health: http://localhost:8080/api/v1/health
```

## Quality

```bash
pytest
ruff check .
black --check .
mypy app
```
```

- [ ] **Step 10: Create venv and install**

Run (from `backend/`):
```bash
python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
```
Expected: install completes without errors.

- [ ] **Step 11: Commit**

```bash
git add backend
git commit -m "chore: scaffold backend project files (deps, tooling, docker)"
```

---

## Task 2: Settings (config) — TDD

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Create package `__init__.py` files**

Create empty files `backend/app/__init__.py` and `backend/app/core/__init__.py`.

- [ ] **Step 2: Write the failing test** — `backend/tests/test_config.py`

```python
from app.core.config import Settings, get_settings


def test_defaults():
    settings = Settings()
    assert settings.app_env == "dev"
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.log_level == "INFO"


def test_env_override(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    settings = Settings()
    assert settings.app_env == "prod"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL (ModuleNotFoundError: app.core.config)

- [ ] **Step 4: Write minimal implementation** — `backend/app/core/config.py`

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "dev"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    app_version: str = "0.1.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/__init__.py backend/app/core/__init__.py backend/app/core/config.py backend/tests/test_config.py
git commit -m "feat: add typed settings via pydantic-settings"
```

---

## Task 3: Request context (request-id) — TDD

**Files:**
- Create: `backend/app/core/request_context.py`
- Test: `backend/tests/test_request_context.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_request_context.py`

```python
from app.core.request_context import get_request_id, set_request_id


def test_default_request_id():
    assert get_request_id() == "-"


def test_set_and_get_request_id():
    set_request_id("abc-123")
    assert get_request_id() == "abc-123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_request_context.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation** — `backend/app/core/request_context.py`

```python
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return _request_id_ctx.get()


def set_request_id(value: str) -> None:
    _request_id_ctx.set(value)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        set_request_id(request_id)
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_request_context.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/request_context.py backend/tests/test_request_context.py
git commit -m "feat: add request-id context and middleware"
```

---

## Task 4: Structured JSON logging — TDD

**Files:**
- Create: `backend/app/core/logging.py`
- Test: `backend/tests/test_logging.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_logging.py`

```python
import json
import logging

from app.core.logging import JsonFormatter


def test_json_formatter_outputs_valid_json():
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    output = formatter.format(record)
    data = json.loads(output)
    assert data["message"] == "hello"
    assert data["level"] == "INFO"
    assert "request_id" in data
    assert "timestamp" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_logging.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation** — `backend/app/core/logging.py`

```python
import json
import logging
import sys
from datetime import datetime, timezone

from app.core.request_context import get_request_id


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_logging.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/logging.py backend/tests/test_logging.py
git commit -m "feat: add structured JSON logging with request-id"
```

---

## Task 5: Uniform error handling — TDD (test deferred to Task 9 integration)

**Files:**
- Create: `backend/app/core/errors.py`

- [ ] **Step 1: Write minimal implementation** — `backend/app/core/errors.py`

```python
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


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body("http_error", str(exc.detail)),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
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
```

> Behavior is verified by `tests/test_errors.py` in Task 9 (needs the wired app).

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/errors.py
git commit -m "feat: add uniform error model and exception handlers"
```

---

## Task 6: Cursor pagination contract — TDD

**Files:**
- Create: `backend/app/core/pagination.py`
- Test: `backend/tests/test_pagination.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_pagination.py`

```python
from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_cursor,
    encode_cursor,
)


def test_cursor_roundtrip():
    assert decode_cursor(encode_cursor("id_123")) == "id_123"


def test_pagination_params_defaults():
    params = PaginationParams()
    assert params.limit == 20
    assert params.cursor is None


def test_cursor_page_defaults():
    page: CursorPage[int] = CursorPage(items=[1, 2, 3])
    assert page.items == [1, 2, 3]
    assert page.has_more is False
    assert page.next_cursor is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_pagination.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation** — `backend/app/core/pagination.py`

```python
import base64
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class PaginationParams(BaseModel):
    limit: int = DEFAULT_LIMIT
    cursor: str | None = None


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode()


def decode_cursor(cursor: str) -> str:
    return base64.urlsafe_b64decode(cursor.encode()).decode()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_pagination.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/pagination.py backend/tests/test_pagination.py
git commit -m "feat: add cursor-based pagination contract"
```

---

## Task 7: Idempotency contract — TDD

**Files:**
- Create: `backend/app/core/idempotency.py`
- Test: `backend/tests/test_idempotency.py`

- [ ] **Step 1: Write the failing test** — `backend/tests/test_idempotency.py`

```python
from app.core.idempotency import IdempotencyKey, IdempotencyStore


class FakeStore:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, object]] = {}

    def get(self, key: IdempotencyKey) -> dict[str, object] | None:
        return self._data.get(key)

    def put(
        self, key: IdempotencyKey, response: dict[str, object], ttl_seconds: int
    ) -> None:
        self._data[key] = response


def test_fake_store_satisfies_protocol():
    store: IdempotencyStore = FakeStore()
    key = IdempotencyKey("abc")
    assert store.get(key) is None
    store.put(key, {"ok": True}, 60)
    assert store.get(key) == {"ok": True}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_idempotency.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Write minimal implementation** — `backend/app/core/idempotency.py`

```python
from typing import Protocol, runtime_checkable


class IdempotencyKey(str):
    """Opaque idempotency key supplied via the Idempotency-Key header."""


@runtime_checkable
class IdempotencyStore(Protocol):
    """Contract for persisting idempotency keys + cached responses.

    Concrete implementations (Redis/DB) arrive in later phases.
    """

    def get(self, key: IdempotencyKey) -> dict[str, object] | None: ...

    def put(
        self, key: IdempotencyKey, response: dict[str, object], ttl_seconds: int
    ) -> None: ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_idempotency.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/idempotency.py backend/tests/test_idempotency.py
git commit -m "feat: add idempotency-key contract"
```

---

## Task 8: Health module (SOLID slice) — TDD

**Files:**
- Create: `backend/app/modules/__init__.py`
- Create: `backend/app/modules/health/__init__.py`
- Create: `backend/app/modules/health/schemas.py`
- Create: `backend/app/modules/health/ports.py`
- Create: `backend/app/modules/health/adapters.py`
- Create: `backend/app/modules/health/service.py`
- Create: `backend/app/modules/health/api.py`
- Test: `backend/tests/test_health_service.py`

- [ ] **Step 1: Create package `__init__.py` files**

Create empty files `backend/app/modules/__init__.py` and `backend/app/modules/health/__init__.py`.

- [ ] **Step 2: Write the failing test** — `backend/tests/test_health_service.py`

```python
from app.core.config import Settings
from app.modules.health.adapters import InMemoryHealthCheck
from app.modules.health.service import HealthService


def test_service_returns_ok_status():
    settings = Settings(app_env="staging", app_version="9.9.9")
    service = HealthService(InMemoryHealthCheck(settings))

    status = service.get_status()

    assert status.status == "ok"
    assert status.env == "staging"
    assert status.version == "9.9.9"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_health_service.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 4: Implement `schemas.py`** — `backend/app/modules/health/schemas.py`

```python
from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: str
    env: str
    version: str
```

- [ ] **Step 5: Implement `ports.py`** — `backend/app/modules/health/ports.py`

```python
from abc import ABC, abstractmethod

from app.modules.health.schemas import HealthStatus


class HealthCheckPort(ABC):
    @abstractmethod
    def check(self) -> HealthStatus: ...
```

- [ ] **Step 6: Implement `adapters.py`** — `backend/app/modules/health/adapters.py`

```python
from app.core.config import Settings
from app.modules.health.ports import HealthCheckPort
from app.modules.health.schemas import HealthStatus


class InMemoryHealthCheck(HealthCheckPort):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def check(self) -> HealthStatus:
        return HealthStatus(
            status="ok",
            env=self._settings.app_env,
            version=self._settings.app_version,
        )
```

- [ ] **Step 7: Implement `service.py`** — `backend/app/modules/health/service.py`

```python
from app.modules.health.ports import HealthCheckPort
from app.modules.health.schemas import HealthStatus


class HealthService:
    def __init__(self, health_check: HealthCheckPort) -> None:
        self._health_check = health_check

    def get_status(self) -> HealthStatus:
        return self._health_check.check()
```

- [ ] **Step 8: Implement `api.py`** — `backend/app/modules/health/api.py`

```python
from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.modules.health.adapters import InMemoryHealthCheck
from app.modules.health.schemas import HealthStatus
from app.modules.health.service import HealthService

router = APIRouter(tags=["health"])


def get_health_service(settings: Settings = Depends(get_settings)) -> HealthService:
    return HealthService(InMemoryHealthCheck(settings))


@router.get("/health", response_model=HealthStatus)
def health(service: HealthService = Depends(get_health_service)) -> HealthStatus:
    return service.get_status()
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pytest tests/test_health_service.py -v`
Expected: PASS (1 passed)

- [ ] **Step 10: Commit**

```bash
git add backend/app/modules
git add backend/tests/test_health_service.py
git commit -m "feat: add health module (api->service->port->adapter)"
```

---

## Task 9: Wire the app + integration tests — TDD

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`
- Test: `backend/tests/test_errors.py`

- [ ] **Step 1: Create package `__init__.py` files**

Create empty files `backend/app/api/__init__.py` and `backend/app/api/v1/__init__.py`.

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok():
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "env" in body
    assert "version" in body


def test_health_sets_request_id_header():
    resp = client.get("/api/v1/health")
    assert resp.headers.get("X-Request-ID")
```

`backend/tests/test_errors.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_unknown_route_returns_uniform_error():
    resp = client.get("/api/v1/nope")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "http_error"
    assert "request_id" in body["error"]
    assert "message" in body["error"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_health.py tests/test_errors.py -v`
Expected: FAIL (ModuleNotFoundError: app.main)

- [ ] **Step 4: Implement `router.py`** — `backend/app/api/v1/router.py`

```python
from fastapi import APIRouter

from app.modules.health.api import router as health_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
```

- [ ] **Step 5: Implement `main.py`** — `backend/app/main.py`

```python
from fastapi import FastAPI

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.request_context import RequestIdMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="Vendelo AI API", version=settings.app_version)
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_health.py tests/test_errors.py -v`
Expected: PASS (3 passed)

> If `test_unknown_route_returns_uniform_error` returns FastAPI's default 404 body instead of our shape, ensure handlers are registered for `StarletteHTTPException` (not only `fastapi.HTTPException`) — the implementation in Task 5 already does this.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api backend/app/main.py backend/tests/test_health.py backend/tests/test_errors.py
git commit -m "feat: wire FastAPI app with v1 router, middleware, error handlers"
```

---

## Task 10: Final verification (Definition of Done)

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run (from `backend/`): `pytest -v`
Expected: ALL pass (test_config, test_request_context, test_logging, test_pagination, test_idempotency, test_health_service, test_health, test_errors).

- [ ] **Step 2: Lint**

Run: `ruff check .`
Expected: no errors (fix any reported; re-run).

- [ ] **Step 3: Format check**

Run: `black --check .`
Expected: all files formatted (if not, run `black .`, re-commit).

- [ ] **Step 4: Type check**

Run: `mypy app`
Expected: `Success: no issues found`. If pydantic generic (`CursorPage`) triggers a complaint, confirm `plugins = ["pydantic.mypy"]` is set in `pyproject.toml`.

- [ ] **Step 5: Manual smoke test**

Run: `uvicorn app.main:app --port 8080` then in another shell `curl -i localhost:8080/api/v1/health`
Expected: HTTP 200, JSON `{"status":"ok",...}`, response includes `X-Request-ID` header, and server logs are single-line JSON.

- [ ] **Step 6: Verify legacy frontend still builds (path-only change)**

Run (from `frontend-legacy/`): `npm run build`
Expected: build succeeds (no code changed, only directory renamed).

- [ ] **Step 7: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "chore: phase 1 backend foundations verification fixes"
```

---

## Self-review notes (author)

- **Spec coverage:** repo restructure (T0), project files/config/tooling/docker (T1), config (T2), request-id (T3), logging (T4), errors (T5+T9), pagination (T6), idempotency (T7), health SOLID slice (T8), app wiring + health endpoint (T9), DoD gates (T10). All spec sections mapped.
- **Type/name consistency:** `Settings`, `get_settings`, `HealthStatus`, `HealthCheckPort.check`, `HealthService.get_status`, `InMemoryHealthCheck`, `api_v1_router`, `RequestIdMiddleware`, `register_exception_handlers`, `configure_logging`, `CursorPage`, `PaginationParams`, `IdempotencyKey`, `IdempotencyStore` — used consistently across tasks.
- **Known gotchas flagged:** Starlette vs FastAPI HTTPException for the 404 handler; pydantic mypy plugin for generics; httpx required by TestClient (in dev deps).
