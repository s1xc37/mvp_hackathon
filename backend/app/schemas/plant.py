from pydantic import BaseModel
from app.schemas.vehicle import VehicleSummary


class Plant(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    capacity_t_per_hour: float
    mix_temp_c: int
    active: bool
    materials: list[str] = []
    vehicle_ids: list[int] = []


class PlantDetail(Plant):
    vehicles: list[VehicleSummary] = []
    vehicle_count: int = 0
