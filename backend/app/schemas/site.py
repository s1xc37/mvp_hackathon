from typing import Literal
from pydantic import BaseModel
from app.schemas.lane import Lane, LanePolygon


class Site(BaseModel):
    id: str
    numeric_id: int = 0
    name: str
    km_marker: int
    lat: float
    lon: float
    coords: list[float] = []
    polygon: list[list[float]]
    photo: str | None = None
    lanes: list[Lane] = []
    lane_polygons: list[LanePolygon] = []
    width_m: float
    length_m: float
    layer_type: Literal["standard", "thin"]
    plant_id: str
    delivery_time_min: int
    repair_hours: int = 72
    weather_suitable: bool | None = None
    weather_note: str = ""
    weather_windows: list[str] = []
