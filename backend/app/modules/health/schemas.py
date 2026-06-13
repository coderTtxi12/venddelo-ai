from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: str
    env: str
    version: str
