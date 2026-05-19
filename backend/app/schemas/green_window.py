from datetime import datetime
from pydantic import BaseModel


class TimeSlot(BaseModel):
    start: datetime
    end: datetime
    duration_min: int
    max_tonnage_t: float
    is_optimal: bool
    yellow_start: datetime
    rate_t_per_min: float


class PrepInfo(BaseModel):
    to_plant_min: float
    load_min: float
    delivery_min: float
    total_min: float
    has_brigade: bool


class BrigadeMember(BaseModel):
    id: int
    type: str
    name: str
    to_plant_km: float
    to_plant_min: float
    capacity_t: float


class GreenWindow(BaseModel):
    site_id: str
    site_name: str
    date: str
    slots: list[TimeSlot]
    order_deadline: datetime | None
    warnings: list[str]
    prep: PrepInfo | None = None
    brigade: list[BrigadeMember] = []
    plant_name: str | None = None
    road_total_t: float = 0.0
    road_area_m2: float = 0.0
