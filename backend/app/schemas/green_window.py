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
    optimal_tonnage_t: float = 0.0
    bottleneck: str = "paver"   # 'paver' | 'demand' | 'plant' | 'delivery'


class PrepInfo(BaseModel):
    to_plant_min: float
    load_min: float
    delivery_min: float
    total_min: float
    has_brigade: bool
    mix_temp_start_c: float = 160.0
    mix_temp_arrival_c: float = 160.0
    mix_usable: bool = True
    mix_optimal: bool = True
    heated_share: float = 0.0
    cool_rate: float = 0.35
    cool_rate_waiting: float = 0.2
    site_wait_min: float = 10
    required_mix_temp_c: float = 160.0
    drying_min: int = 0
    air_temp_c: float | None = None
    wind_ms: float | None = None


class BrigadeMember(BaseModel):
    id: int
    type: str
    name: str
    to_plant_km: float
    to_plant_min: float
    capacity_t: float
    is_heated: bool = False


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
