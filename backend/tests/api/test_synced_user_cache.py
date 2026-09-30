import uuid
from types import SimpleNamespace

from app.api import deps
from app.api.synced_user_cache import SyncedUserCache
from app.core.security import AuthenticatedUser
from app.modules.users.schemas import UserDTO


def _auth(**overrides):
    data = {
        "id": uuid.uuid4(),
        "email": "owner@example.com",
        "display_name": "Owner",
        "avatar_url": "https://example.com/avatar.png",
        "role": "authenticated",
    }
    data.update(overrides)
    return AuthenticatedUser(**data)


def _user(auth: AuthenticatedUser) -> UserDTO:
    now = "2026-09-29T22:00:00+00:00"
    return UserDTO.model_validate(
        {
            "id": auth.id,
            "email": auth.email,
            "display_name": auth.display_name,
            "avatar_url": auth.avatar_url,
            "role": "owner",
            "plan": "free",
            "billing_customer_id": None,
            "created_at": now,
            "updated_at": now,
        }
    )


def test_synced_user_cache_reuses_matching_auth_claims() -> None:
    cache = SyncedUserCache(clock=lambda: 100.0)
    auth = _auth()
    user = _user(auth)

    cache.set(auth, user, ttl_seconds=30)

    assert cache.get(auth, ttl_seconds=30) == user


def test_synced_user_cache_misses_when_claims_change_or_entry_expires() -> None:
    now = 100.0
    cache = SyncedUserCache(clock=lambda: now)
    auth = _auth()

    cache.set(auth, _user(auth), ttl_seconds=30)

    changed = _auth(id=auth.id, email="new@example.com")
    assert cache.get(changed, ttl_seconds=30) is None

    now = 131.0
    assert cache.get(auth, ttl_seconds=30) is None


def test_get_synced_user_commits_before_caching(monkeypatch) -> None:
    auth = _auth()
    user = _user(auth)
    order: list[str] = []
    uow = SimpleNamespace(
        users=object(),
        commit=lambda: order.append("commit"),
    )

    monkeypatch.setattr(
        deps,
        "get_settings",
        lambda: SimpleNamespace(app_env="prod", synced_user_cache_ttl_seconds=30),
    )
    monkeypatch.setattr(deps.synced_user_cache, "get", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        deps.synced_user_cache,
        "set",
        lambda *_args, **_kwargs: order.append("cache"),
    )
    monkeypatch.setattr(
        deps.UserService,
        "sync_from_auth",
        lambda *_args, **_kwargs: user,
    )

    assert deps.get_synced_user(auth=auth, uow=uow) == user
    assert order == ["commit", "cache"]
