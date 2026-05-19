from datetime import datetime
from pydantic import BaseModel


class MaintenanceTask(BaseModel):
    site_id: str
    task_type: str
    description: str
    scheduled_at: datetime
    priority: str


class MaintenanceRequest(BaseModel):
    site_ids: list[str]


class MaintenanceResponse(BaseModel):
    tasks: list[MaintenanceTask]
    total: int
