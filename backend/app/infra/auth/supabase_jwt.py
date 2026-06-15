from __future__ import annotations

import uuid
from datetime import UTC, datetime

import jwt

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.security import AuthenticatedUser, AuthPort


class SupabaseJwtAuth(AuthPort):
    def __init__(self, settings: Settings) -> None:
        self._secret = settings.supabase_jwt_secret
        self._audience = settings.jwt_audience

    def verify_token(self, token: str) -> AuthenticatedUser:
        if not self._secret:
            raise UnauthorizedError("JWT verification is not configured")
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Invalid or expired token") from exc

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
