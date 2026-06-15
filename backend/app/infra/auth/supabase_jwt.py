from __future__ import annotations

import uuid
from datetime import UTC, datetime

import jwt
from jwt import PyJWKClient

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.security import AuthenticatedUser, AuthPort


class SupabaseJwtAuth(AuthPort):
    def __init__(self, settings: Settings) -> None:
        self._secret = settings.supabase_jwt_secret
        self._audience = settings.jwt_audience
        self._jwks_client: PyJWKClient | None = None
        if settings.supabase_url:
            jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
            self._jwks_client = PyJWKClient(jwks_url, cache_keys=True)

    def verify_token(self, token: str) -> AuthenticatedUser:
        payload = self._decode_payload(token)

        sub = payload.get("sub")
        if not sub:
            raise UnauthorizedError("Token missing subject")
        try:
            user_id = uuid.UUID(str(sub))
        except ValueError as exc:
            raise UnauthorizedError("Invalid token subject") from exc

        exp = payload.get("exp")
        if exp is not None and datetime.fromtimestamp(exp, tz=UTC) < datetime.now(UTC):
            raise UnauthorizedError("Token expired")

        return AuthenticatedUser(
            id=user_id,
            email=payload.get("email"),
            role=payload.get("role"),
        )

    def _decode_payload(self, token: str) -> dict:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Invalid or expired token") from exc

        alg = header.get("alg", "HS256")

        if alg == "HS256":
            return self._decode_hs256(token)

        if self._jwks_client is None:
            raise UnauthorizedError("JWT verification is not configured")

        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience=self._audience,
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Invalid or expired token") from exc

    def _decode_hs256(self, token: str) -> dict:
        if not self._secret:
            raise UnauthorizedError("JWT verification is not configured")
        try:
            return jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Invalid or expired token") from exc
