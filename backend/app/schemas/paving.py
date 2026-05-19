from pydantic import BaseModel


class PrepBreakdown(BaseModel):
    to_plant_min: float
    load_min: float
    delivery_min: float
    total_min: float
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


class BrigadeVehicle(BaseModel):
    id: int
    type: str
    name: str
    coords: list[float] | None
    capacity_t: float
    to_plant_km: float
    to_plant_min: float


class LogisticsPlan(BaseModel):
    total_demand_t: float
    target_load_per_truck_t: float
    max_load_per_trip_t: float
    trips_per_truck: int
    trips_total: int
    interval_min: float
    savings_t: float
    savings_pct: float
    bottleneck: str  # 'window' | 'temperature' | 'capacity'
    n_trucks: int
    truck_capacity_t: float
    arrival_temp_c: float


class AutoBrigadeRequest(BaseModel):
    road_id: str


class AutoBrigadeResponse(BaseModel):
    road_id: str
    plant_id: str
    plant_name: str
    vehicles: list[BrigadeVehicle]
    prep: PrepBreakdown
    logistics: LogisticsPlan | None = None


class PavingRouteRequest(BaseModel):
    road_id: str
    plant_id: str | None = None
    vehicle_ids: list[int] | None = None
    load_t_per_truck: float | None = None  # переопределение оптимума оператором


class VehiclePlan(BaseModel):
    vehicle_id: int
    vehicle_type: str
    vehicle_name: str
    start_coords: list[float]
    to_plant_route: list[list[float]]
    to_plant_min: float
    to_plant_km: float
    capacity_t: float
    load_t: float = 0.0              # рекомендованная загрузка для этой фуры
    departure_offset_min: float = 0.0  # старт относительно первой фуры (конвейер)


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
    logistics: LogisticsPlan | None = None


class PavingCompleteRequest(BaseModel):
    road_id: str
    lane_nums: list[int] | None = None
    vehicle_ids: list[int] | None = None


class PavingCompleteResponse(BaseModel):
    road_id: str
    lanes_updated: int
    last_paved: str
    new_condition: str
