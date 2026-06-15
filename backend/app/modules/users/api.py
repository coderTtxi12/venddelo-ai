from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_synced_user
from app.core.security import AuthenticatedUser
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.users.schemas import UserDTO, UserProfileUpdate
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> UserService:
    return UserService(uow.users)


@router.get("/me", response_model=UserDTO)
def get_me(user: UserDTO = Depends(get_synced_user)) -> UserDTO:
    return user


@router.patch("/me", response_model=UserDTO)
def update_me(
    data: UserProfileUpdate,
    auth: AuthenticatedUser = Depends(get_current_user),
    service: UserService = Depends(_service),
) -> UserDTO:
    return service.update_profile(auth.id, data)
