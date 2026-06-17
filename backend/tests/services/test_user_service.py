import uuid

from app.core.security import AuthenticatedUser
from app.modules.users.adapters import SqlAlchemyUserRepository
from app.modules.users.service import UserService
from tests.conftest import requires_db


@requires_db
def test_sync_creates_user(session):
    auth = AuthenticatedUser(
        id=uuid.uuid4(),
        email="owner@example.com",
        display_name="Oliver",
        avatar_url="https://example.com/avatar.png",
    )
    svc = UserService(SqlAlchemyUserRepository(session))
    user = svc.sync_from_auth(auth)
    session.commit()

    assert user.id == auth.id
    assert user.email == "owner@example.com"
    assert user.display_name == "Oliver"
    assert user.role == "owner"
    assert user.plan == "free"


@requires_db
def test_sync_updates_profile_from_token(session):
    user_id = uuid.uuid4()
    svc = UserService(SqlAlchemyUserRepository(session))
    svc.sync_from_auth(AuthenticatedUser(id=user_id, email="a@b.com"))
    session.commit()

    updated = svc.sync_from_auth(
        AuthenticatedUser(
            id=user_id,
            email="a@b.com",
            display_name="New Name",
            avatar_url="https://cdn.example/pic.jpg",
        )
    )
    session.commit()

    assert updated.display_name == "New Name"
    assert updated.avatar_url == "https://cdn.example/pic.jpg"


@requires_db
def test_sync_defaults_owner_for_supabase_auth_role(session):
    user_id = uuid.uuid4()
    svc = UserService(SqlAlchemyUserRepository(session))
    user = svc.sync_from_auth(
        AuthenticatedUser(id=user_id, email="new@example.com", role="authenticated")
    )
    session.commit()
    assert user.role == "owner"


@requires_db
def test_sync_idempotent(session):
    user_id = uuid.uuid4()
    svc = UserService(SqlAlchemyUserRepository(session))
    first = svc.sync_from_auth(AuthenticatedUser(id=user_id, email="x@y.com"))
    second = svc.sync_from_auth(AuthenticatedUser(id=user_id, email="x@y.com"))
    session.commit()
    assert first.id == second.id
