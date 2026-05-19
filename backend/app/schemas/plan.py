from pydantic import BaseModel
from app.schemas.vehicle import VehicleSummary, VehicleType


class PlanRequest(BaseModel):
    road_id: str
    lane_id: int


class PlanResponse(BaseModel):
    road_id: str
    road_name: str
    dump_trucks: int
    transfer_machines: int
    pavers: int
    rollers: int
    closure_vehicles: int
    suggested_vehicles: dict[VehicleType, list[VehicleSummary]]
