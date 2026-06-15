class DomainError(Exception):
    http_status: int = 400
    code: str = "domain_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class UnauthorizedError(DomainError):
    http_status = 401
    code = "unauthorized"


class ForbiddenError(DomainError):
    http_status = 403
    code = "forbidden"


class NotFoundError(DomainError):
    http_status = 404
    code = "not_found"


class ConflictError(DomainError):
    http_status = 409
    code = "conflict"


class ValidationError(DomainError):
    http_status = 400
    code = "validation_error"
