from fastapi import APIRouter

from app.schemas.maintenance import MaintenanceRequest, MaintenanceResponse
from app.services.maintenance import schedule_maintenance

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("/schedule", response_model=MaintenanceResponse)
async def schedule(req: MaintenanceRequest) -> MaintenanceResponse:
    return schedule_maintenance(req)
