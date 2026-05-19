from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db.deps import get_db
from app.db.models import LaneORM
from app.schemas.lane import Lane

router = APIRouter(prefix="/api/lanes", tags=["lanes"])


class LaneItem(Lane):
    road_id: str
    road_name: str
    repair_hours: int
    weather_suitable: bool | None = None
    weather_note: str = ""
    weather_windows: list[str] = []


@router.get("", response_model=list[LaneItem])
async def list_lanes(db: Session = Depends(get_db)) -> list[LaneItem]:
    rows = db.query(LaneORM).options(joinedload(LaneORM.site)).all()
    return [
        LaneItem(
            id=l.num,
            name=l.name,
            direction=l.direction,
            condition=l.condition.value,
            last_paved=l.last_paved,
            road_id=l.site.id,
            road_name=l.site.name,
            repair_hours=l.repair_hours or l.site.repair_hours or 72,
            weather_suitable=l.weather_suitable,
            weather_note=l.weather_note or "",
            weather_windows=l.weather_windows or [],
        )
        for l in rows
    ]
