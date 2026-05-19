from pydantic import BaseModel


class RerouteRequest(BaseModel):
    blocked_site_id: str
    available_tonnage_t: float


class RerouteOption(BaseModel):
    site_id: str
    site_name: str
    distance_km: float
    extra_time_min: int
    has_green_window: bool
    recommended_tonnage_t: float


class RerouteResponse(BaseModel):
    blocked_site_id: str
    options: list[RerouteOption]
    recommendation: str
