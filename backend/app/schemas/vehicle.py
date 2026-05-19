from typing import Literal
from pydantic import BaseModel

VehicleType = Literal["dump_truck", "transfer_machine", "paver", "roller", "closure_vehicle"]


class ScheduleEntry(BaseModel):
    date: str
    time: str
    location: str
    task: str


class VehicleSummary(BaseModel):
    id: int
    type: VehicleType
    name: str
    coords: list[float] | None = None
    speed_kmh: int = 0
    current_task: str | None = None
    location_type: str | None = None
    location_name: str | None = None
    home_type: str | None = None
    home_id: int | str | None = None
    capacity_t: float = 0.0
    load_t: float = 0.0
    is_heated: bool = False


class Vehicle(VehicleSummary):
    schedule: list[ScheduleEntry] = []
