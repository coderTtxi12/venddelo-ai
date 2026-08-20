import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.infra.auth.supabase_jwt import (
    JWKS_CACHE_LIFESPAN_SECONDS,
    SupabaseJwtAuth,
    build_jwks_client,
    build_supabase_jwt_auth,
    jwks_url_for_supabase,
    warm_jwks_cache,
)

SECRET = "test-jwt-secret-for-unit-tests"
USER_ID = uuid.uuid4()
SUPABASE_URL = "https://example.supabase.co"


def _token(*, exp_delta: timedelta = timedelta(hours=1), sub: str | None = None) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": sub or str(USER_ID),
        "aud": "authenticated",
        "exp": now + exp_delta,
        "email": "owner@example.com",
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def test_verify_valid_token():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    user = auth.verify_token(_token())
    assert user.id == USER_ID
    assert user.email == "owner@example.com"


def test_ignores_supabase_auth_role_claim():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(USER_ID),
            "aud": "authenticated",
            "role": "authenticated",
            "exp": now + timedelta(hours=1),
            "email": "new@example.com",
        },
        SECRET,
        algorithm="HS256",
    )
    user = auth.verify_token(token)
    assert user.role is None


def test_uses_app_metadata_role():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(USER_ID),
            "aud": "authenticated",
            "role": "authenticated",
            "app_metadata": {"role": "staff"},
            "exp": now + timedelta(hours=1),
            "email": "staff@example.com",
        },
        SECRET,
        algorithm="HS256",
    )
    user = auth.verify_token(token)
    assert user.role == "staff"


def test_reject_expired_token():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    with pytest.raises(UnauthorizedError):
        auth.verify_token(_token(exp_delta=timedelta(hours=-1)))


def test_reject_invalid_signature():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    with pytest.raises(UnauthorizedError):
        auth.verify_token(_token() + "bad")


def test_reject_missing_sub():
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET))
    now = datetime.now(UTC)
    token = jwt.encode(
        {"aud": "authenticated", "exp": now + timedelta(hours=1)},
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        auth.verify_token(token)


def test_jwks_url_for_supabase():
    assert (
        jwks_url_for_supabase("https://abc.supabase.co/")
        == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    )


def test_build_jwks_client_uses_supabase_cache_lifespan():
    client = build_jwks_client(SUPABASE_URL)
    assert client.jwk_set_cache is not None
    assert client.jwk_set_cache.lifespan == JWKS_CACHE_LIFESPAN_SECONDS


def test_build_supabase_jwt_auth_reuses_shared_jwks_client():
    settings = Settings(supabase_url=SUPABASE_URL, supabase_jwt_secret=SECRET)
    shared = build_jwks_client(SUPABASE_URL)
    auth = build_supabase_jwt_auth(settings, jwks_client=shared)
    assert auth.jwks_client is shared


def test_warm_jwks_cache_prefetches_jwk_set():
    client = MagicMock()
    auth = SupabaseJwtAuth(Settings(supabase_jwt_secret=SECRET), jwks_client=client)
    warm_jwks_cache(auth)
    client.get_jwk_set.assert_called_once_with()


def test_get_auth_reads_from_app_state():
    from contextlib import asynccontextmanager

    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    from app.api.deps import get_auth
    from app.infra.auth.supabase_jwt import build_supabase_jwt_auth

    settings = Settings(supabase_jwt_secret=SECRET)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.auth = build_supabase_jwt_auth(settings)
        yield
        app.state.auth = None

    mini = FastAPI(lifespan=lifespan)

    @mini.get("/probe")
    def probe(auth=Depends(get_auth)):
        return {"ok": True, "same": auth is mini.state.auth}

    with TestClient(mini) as client:
        response = client.get("/probe")
        assert response.status_code == 200
        assert response.json()["same"] is True


def test_get_auth_works_on_websocket():
    from contextlib import asynccontextmanager

    from fastapi import Depends, FastAPI, WebSocket
    from fastapi.testclient import TestClient

    from app.api.deps import get_auth
    from app.infra.auth.supabase_jwt import build_supabase_jwt_auth

    settings = Settings(supabase_jwt_secret=SECRET)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.auth = build_supabase_jwt_auth(settings)
        yield
        app.state.auth = None

    mini = FastAPI(lifespan=lifespan)

    @mini.websocket("/probe-ws")
    async def probe_ws(websocket: WebSocket, auth=Depends(get_auth)):
        await websocket.accept()
        await websocket.send_json({"same": auth is mini.state.auth})
        await websocket.close()

    with TestClient(mini) as client:
        with client.websocket_connect("/probe-ws") as ws:
            assert ws.receive_json()["same"] is True
