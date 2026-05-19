from app.core.geo import haversine_km
from app.schemas.plan import PlanRequest, PlanResponse
from app.schemas.vehicle import VehicleSummary
from app.services.fleet import list_vehicles


def plan_brigade(req: PlanRequest, road_lat: float, road_lon: float, road_name: str, repair_hours: int) -> PlanResponse:
    dump_truck_count = max(2, round(repair_hours / 36))

    all_vehicles = list_vehicles()

    def nearest(vtype: str, count: int) -> list[VehicleSummary]:
        candidates = [v for v in all_vehicles if v.type == vtype and v.coords]
        candidates.sort(key=lambda v: haversine_km(road_lat, road_lon, v.coords[0], v.coords[1]))
        return candidates[:count]

    suggested: dict = {
        "dump_truck": nearest("dump_truck", dump_truck_count),
        "transfer_machine": nearest("transfer_machine", 1),
        "paver": nearest("paver", 1),
        "roller": nearest("roller", 2),
        "closure_vehicle": nearest("closure_vehicle", 1),
    }

    return PlanResponse(
        road_id=req.road_id,
        road_name=road_name,
        dump_trucks=dump_truck_count,
        transfer_machines=1,
        pavers=1,
        rollers=2,
        closure_vehicles=1,
        suggested_vehicles=suggested,
    )
