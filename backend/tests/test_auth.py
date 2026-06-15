import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.infra.auth.supabase_jwt import SupabaseJwtAuth

SECRET = "test-jwt-secret-for-unit-tests"
USER_ID = uuid.uuid4()


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
