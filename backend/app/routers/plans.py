from fastapi import APIRouter, HTTPException

from app.core.data_utils import get_site_by_id
from app.schemas.plan import PlanRequest, PlanResponse
from app.services.planner import plan_brigade

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.post("", response_model=PlanResponse)
async def create_plan(req: PlanRequest) -> PlanResponse:
    site = get_site_by_id(req.road_id)
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    return plan_brigade(req, site.lat, site.lon, site.name, site.repair_hours)
