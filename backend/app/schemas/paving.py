from pydantic import BaseModel


class PrepBreakdown(BaseModel):
    to_plant_min: float
    load_min: float
    delivery_min: float
    total_min: float


class BrigadeVehicle(BaseModel):
    id: int
    type: str
    name: str
    coords: list[float] | None
    capacity_t: float
    to_plant_km: float
    to_plant_min: float


class AutoBrigadeRequest(BaseModel):
    road_id: str


class AutoBrigadeResponse(BaseModel):
    road_id: str
    plant_id: str
    plant_name: str
    vehicles: list[BrigadeVehicle]
    prep: PrepBreakdown


class PavingRouteRequest(BaseModel):
    road_id: str
    plant_id: str | None = None
    vehicle_ids: list[int] | None = None


class VehiclePlan(BaseModel):
    vehicle_id: int
    vehicle_type: str
    vehicle_name: str
    start_coords: list[float]
    to_plant_route: list[list[float]]
    to_plant_min: float
    to_plant_km: float
    capacity_t: float


class PavingRouteResponse(BaseModel):
    road_id: str
    plant_id: str
    plant_name: str
    route: list[list[float]]
    distance_km: float
    duration_min: float
    start: list[float]
    end: list[float]
    source: str
    paving_path: list[list[float]]
    paving_length_m: float
    vehicles: list[VehiclePlan] = []
    prep: PrepBreakdown
    load_minutes: int = 30


class PavingCompleteRequest(BaseModel):
    road_id: str
    lane_nums: list[int] | None = None
    vehicle_ids: list[int] | None = None


class PavingCompleteResponse(BaseModel):
    road_id: str
    lanes_updated: int
    last_paved: str
    new_condition: str
