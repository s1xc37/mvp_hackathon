import asyncio
import json
from datetime import date
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.data_utils import get_site_by_id
from app.core.deps import get_http_client
from app.core.geo import haversine_km
from app.db.database import SessionLocal
from app.db.models import LaneCondition, LaneORM, PlantORM, SiteORM, VehicleORM, VehicleType
from app.schemas.paving import (
    AutoBrigadeRequest,
    AutoBrigadeResponse,
    BrigadeVehicle,
    PavingCompleteRequest,
    PavingCompleteResponse,
    PavingRouteRequest,
    PavingRouteResponse,
    PrepBreakdown,
    VehiclePlan,
)
from app.services.centerline import compute_centerline
from app.services.dispatch import select_brigade, select_nearest_plant, vehicles_by_ids
from app.services.osrm import fetch_route
from app.services.prep import LOAD_MINUTES as _LOAD_MINUTES, calc_prep_breakdown

# Типы техники, которые реально едут по дорогам через OSRM
_OSRM_TYPES = {VehicleType.dump_truck, VehicleType.transfer_machine}

_DATA = Path(__file__).parent.parent / "data"

router = APIRouter(prefix="/api/paving", tags=["paving"])


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def _build_vehicle_plan(
    v: VehicleORM, plant: PlantORM, client: httpx.AsyncClient,
) -> VehiclePlan:
    start = v.coords or [plant.lat, plant.lon]
    if v.type in _OSRM_TYPES and v.coords:
        r = await fetch_route(client, start[0], start[1], plant.lat, plant.lon)
        route = r["route"]
        km = r["distance_km"]
        minutes = r["duration_min"]
    else:
        # Без OSRM — прямая линия, оценка по haversine
        km = haversine_km(start[0], start[1], plant.lat, plant.lon)
        route = [start, [plant.lat, plant.lon]]
        minutes = round(km / 60 * 60, 1)  # ~60 км/ч
    return VehiclePlan(
        vehicle_id=v.id,
        vehicle_type=v.type.value,
        vehicle_name=v.name,
        start_coords=start,
        to_plant_route=route,
        to_plant_min=minutes,
        to_plant_km=km,
        capacity_t=v.capacity_t or 0.0,
    )


@router.post("/route", response_model=PavingRouteResponse)
async def build_route(
    req: PavingRouteRequest,
    client: httpx.AsyncClient = Depends(get_http_client),
    db: Session = Depends(_get_db),
) -> PavingRouteResponse:
    site = db.query(SiteORM).filter(SiteORM.id == req.road_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")

    # 1. Завод: явный → site.plant_id → ближайший
    plant: PlantORM | None = None
    if req.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == req.plant_id).first()
    elif site.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == site.plant_id).first()
    if plant is None:
        plant = select_nearest_plant(site.lat, site.lon, db)
    if plant is None:
        raise HTTPException(status_code=404, detail="Не найден активный АБЗ")

    # 2. Бригада: явный список → или автоподбор
    if req.vehicle_ids:
        brigade = vehicles_by_ids(req.vehicle_ids, db)
    else:
        brigade = select_brigade(site.lat, site.lon, site.repair_hours or 72, db)

    # 3. Маршруты: общий завод→участок + индивидуальные машина→завод
    main_route, *vehicle_plans = await asyncio.gather(
        fetch_route(client, plant.lat, plant.lon, site.lat, site.lon),
        *[_build_vehicle_plan(v, plant, client) for v in brigade],
    )
    paving_path, paving_length_m = compute_centerline(site.polygon, samples=24)

    prep_dict = calc_prep_breakdown(
        brigade, plant.lat, plant.lon, site.delivery_time_min or 0,
    )

    return PavingRouteResponse(
        road_id=site.id,
        plant_id=plant.id,
        plant_name=plant.name,
        route=main_route["route"],
        distance_km=main_route["distance_km"],
        duration_min=main_route["duration_min"],
        start=[plant.lat, plant.lon],
        end=[site.lat, site.lon],
        source=main_route["source"],
        paving_path=paving_path,
        paving_length_m=round(paving_length_m, 1),
        vehicles=list(vehicle_plans),
        prep=PrepBreakdown(**prep_dict),
        load_minutes=_LOAD_MINUTES,
    )


@router.post("/auto-brigade", response_model=AutoBrigadeResponse)
def auto_brigade(
    req: AutoBrigadeRequest,
    db: Session = Depends(_get_db),
) -> AutoBrigadeResponse:
    site = db.query(SiteORM).filter(SiteORM.id == req.road_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")

    plant: PlantORM | None = None
    if site.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == site.plant_id).first()
    if plant is None:
        plant = select_nearest_plant(site.lat, site.lon, db)
    if plant is None:
        raise HTTPException(status_code=404, detail="Не найден активный АБЗ")

    brigade = select_brigade(site.lat, site.lon, site.repair_hours or 72, db)
    prep_dict = calc_prep_breakdown(brigade, plant.lat, plant.lon, site.delivery_time_min or 0)

    out_vehicles: list[BrigadeVehicle] = []
    for v in brigade:
        if v.coords:
            km = haversine_km(v.coords[0], v.coords[1], plant.lat, plant.lon)
        else:
            km = 0.0
        out_vehicles.append(BrigadeVehicle(
            id=v.id,
            type=v.type.value,
            name=v.name,
            coords=v.coords,
            capacity_t=v.capacity_t or 0.0,
            to_plant_km=round(km, 2),
            to_plant_min=round(km / 60 * 60, 1),
        ))

    return AutoBrigadeResponse(
        road_id=site.id,
        plant_id=plant.id,
        plant_name=plant.name,
        vehicles=out_vehicles,
        prep=PrepBreakdown(**prep_dict),
    )


@router.post("/complete", response_model=PavingCompleteResponse)
def complete_paving(
    req: PavingCompleteRequest,
    db: Session = Depends(_get_db),
) -> PavingCompleteResponse:
    site = db.query(SiteORM).filter(SiteORM.id == req.road_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")

    today = date.today()
    q = db.query(LaneORM).filter(LaneORM.site_id == site.id)
    if req.lane_nums:
        q = q.filter(LaneORM.num.in_(req.lane_nums))
    lanes = q.all()
    if not lanes:
        raise HTTPException(status_code=404, detail="Полоса не найдена")

    for lane in lanes:
        lane.condition = LaneCondition.good
        lane.last_paved = today
        lane.repair_hours = 72

    site.repair_hours = 72

    if req.vehicle_ids:
        used = db.query(VehicleORM).filter(VehicleORM.id.in_(req.vehicle_ids)).all()
        for v in used:
            v.load_t = 0.0

    db.commit()

    return PavingCompleteResponse(
        road_id=site.id,
        lanes_updated=len(lanes),
        last_paved=today.isoformat(),
        new_condition=LaneCondition.good.value,
    )


@router.post("/reset-demo")
def reset_demo(db: Session = Depends(_get_db)) -> dict:
    """Восстанавливает состояние полос и техники из seed-данных (для демо)."""
    from app.db.models import VehicleORM, VehicleType
    from app.db.seed import _seed_vehicles

    # Сброс состояния полос
    roads_raw = json.loads((_DATA / "roads.json").read_text())
    lane_count = 0
    for road in roads_raw:
        for i, lane in enumerate(road.get("lanes", []), start=1):
            row = db.query(LaneORM).filter(
                LaneORM.site_id == road["id"],
                LaneORM.num == i,
            ).first()
            if row:
                row.condition = LaneCondition(lane["condition"])
                row.last_paved = date.fromisoformat(lane["last_paved"])
                row.repair_hours = lane.get("repair_hours", 72)
                lane_count += 1

    # Полный сброс техники из JSON
    db.query(VehicleORM).delete()
    db.flush()
    _seed_vehicles(db)

    db.commit()
    return {"lanes_reset": lane_count, "message": f"Восстановлено {lane_count} полос и техника из seed"}
