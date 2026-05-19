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
    LogisticsPlan,
    PavingCompleteRequest,
    PavingCompleteResponse,
    PavingRouteRequest,
    PavingRouteResponse,
    PrepBreakdown,
    VehiclePlan,
)
from app.core.constants import (
    ASPHALT_DENSITY,
    LAYER_THICKNESS_STANDARD,
    LAYER_THICKNESS_THIN,
)
from app.services import weather_aggregator
from app.services.centerline import compute_centerline
from app.services.logistics import calc_optimal_order
from app.services.dispatch import (
    select_best_plant,
    select_brigade,
    select_nearest_plant,
    vehicles_by_ids,
)
from app.services.osrm import fetch_route, fetch_table
from app.services.prep import (
    LOAD_MINUTES as _LOAD_MINUTES,
    calc_prep_breakdown,
    calc_prep_breakdown_async,
)

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

    # 1. Завод: явный → лучший по OSRM+остыванию → закреплённый → ближайший
    plant: PlantORM | None = None
    if req.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == req.plant_id).first()
    else:
        plant, _ = await select_best_plant(site.lat, site.lon, db, client)
        if plant is None and site.plant_id:
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

    # Погода на участке (для остывания)
    forecast = await weather_aggregator.get_forecast(site.id, site.lat, site.lon, client)
    first = forecast.points[0] if forecast.points else None
    air_temp_c = first.temp_c if first else None
    wind_ms = first.wind_ms if first else None
    rain_24h = sum(p.precip_mm for p in forecast.points[:24]) if forecast.points else 0.0

    # 3. Маршруты: общий завод→участок + индивидуальные машина→завод + prep с OSRM/погодой
    main_route, prep_dict, *vehicle_plans = await asyncio.gather(
        fetch_route(client, plant.lat, plant.lon, site.lat, site.lon),
        calc_prep_breakdown_async(
            brigade, plant, site.lat, site.lon, client,
            air_temp_c=air_temp_c, wind_ms=wind_ms, rain_mm_per_day=rain_24h,
        ),
        *[_build_vehicle_plan(v, plant, client) for v in brigade],
    )
    paving_path, paving_length_m = compute_centerline(site.polygon, samples=24)

    # 4. Логистика: оптимальная загрузка фуры с учётом окна и остывания
    thickness = LAYER_THICKNESS_THIN if site.layer_type.value == "thin" else LAYER_THICKNESS_STANDARD
    rate_t_per_min = site.width_m * 2.5 * thickness * ASPHALT_DENSITY  # PAVING_SPEED_AVG=2.5
    # За одно «окно» считаем стандартную 8ч смену либо время полного ремонта (что меньше).
    effective_window_min = min((site.repair_hours or 72) * 60, 8 * 60)
    haulers = [vp for vp in vehicle_plans if vp.vehicle_type in ("dump_truck", "transfer_machine")]
    n_haulers = len(haulers)
    truck_cap = (
        sum(vp.capacity_t for vp in haulers) / n_haulers if n_haulers else 20.0
    )
    logistics_dict = calc_optimal_order(
        rate_t_per_min=rate_t_per_min,
        effective_paving_min=effective_window_min,
        mix_temp_c=plant.mix_temp_c,
        cool_rate=prep_dict["cool_rate"],
        cool_rate_waiting=prep_dict.get("cool_rate_waiting", 0.2),
        delivery_min=prep_dict["delivery_min"],
        n_trucks=n_haulers,
        truck_capacity_t=truck_cap,
    )
    # 5. Проставляем рекомендованную загрузку и offset конвейера в каждый VehiclePlan
    override = req.load_t_per_truck
    target_load = override if override and override > 0 else logistics_dict["target_load_per_truck_t"]
    interval = logistics_dict["interval_min"]
    final_plans: list[VehiclePlan] = []
    hauler_idx = 0
    for vp in vehicle_plans:
        if vp.vehicle_type in ("dump_truck", "transfer_machine"):
            vp.load_t = min(target_load, vp.capacity_t)
            vp.departure_offset_min = hauler_idx * interval
            hauler_idx += 1
        final_plans.append(vp)

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
        vehicles=final_plans,
        prep=PrepBreakdown(**prep_dict),
        load_minutes=_LOAD_MINUTES,
        logistics=LogisticsPlan(**logistics_dict),
    )


@router.post("/auto-brigade", response_model=AutoBrigadeResponse)
async def auto_brigade(
    req: AutoBrigadeRequest,
    client: httpx.AsyncClient = Depends(get_http_client),
    db: Session = Depends(_get_db),
) -> AutoBrigadeResponse:
    site = db.query(SiteORM).filter(SiteORM.id == req.road_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")

    # АБЗ: лучший с учётом OSRM и остывания, иначе закреплённый, иначе ближайший
    plant, _ = await select_best_plant(site.lat, site.lon, db, client)
    if plant is None and site.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == site.plant_id).first()
    if plant is None:
        plant = select_nearest_plant(site.lat, site.lon, db)
    if plant is None:
        raise HTTPException(status_code=404, detail="Не найден активный АБЗ")

    brigade = select_brigade(site.lat, site.lon, site.repair_hours or 72, db)

    forecast = await weather_aggregator.get_forecast(site.id, site.lat, site.lon, client)
    first = forecast.points[0] if forecast.points else None
    air_temp_c = first.temp_c if first else None
    wind_ms = first.wind_ms if first else None
    rain_24h = sum(p.precip_mm for p in forecast.points[:24]) if forecast.points else 0.0

    prep_dict = await calc_prep_breakdown_async(
        brigade, plant, site.lat, site.lon, client,
        air_temp_c=air_temp_c, wind_ms=wind_ms, rain_mm_per_day=rain_24h,
    )

    # OSRM table для всех фур к АБЗ одним запросом
    truck_pts = [tuple(v.coords) for v in brigade if v.coords]
    table = await fetch_table(
        client, sources=truck_pts, destinations=[(plant.lat, plant.lon)],
    )
    durs = [row[0] for row in table["durations_min"]]
    dists = [row[0] for row in table["distances_km"]]

    out_vehicles: list[BrigadeVehicle] = []
    idx = 0
    for v in brigade:
        if v.coords:
            km = dists[idx] if idx < len(dists) else 0.0
            mins = durs[idx] if idx < len(durs) else 0.0
            idx += 1
        else:
            km, mins = 0.0, 0.0
        out_vehicles.append(BrigadeVehicle(
            id=v.id,
            type=v.type.value,
            name=v.name,
            coords=v.coords,
            capacity_t=v.capacity_t or 0.0,
            to_plant_km=round(km, 2),
            to_plant_min=round(mins, 1),
        ))

    # Логистика — точно тот же расчёт что и в /route
    thickness = LAYER_THICKNESS_THIN if site.layer_type.value == "thin" else LAYER_THICKNESS_STANDARD
    rate_t_per_min = site.width_m * 2.5 * thickness * ASPHALT_DENSITY
    eff_window = min((site.repair_hours or 72) * 60, 8 * 60)
    haulers = [v for v in brigade if v.type.value in ("dump_truck", "transfer_machine")]
    n_h = len(haulers)
    avg_cap = (sum(v.capacity_t or 0 for v in haulers) / n_h) if n_h else 20.0
    logistics_dict = calc_optimal_order(
        rate_t_per_min=rate_t_per_min,
        effective_paving_min=eff_window,
        mix_temp_c=plant.mix_temp_c,
        cool_rate=prep_dict["cool_rate"],
        cool_rate_waiting=prep_dict.get("cool_rate_waiting", 0.2),
        delivery_min=prep_dict["delivery_min"],
        n_trucks=n_h,
        truck_capacity_t=avg_cap,
    )

    return AutoBrigadeResponse(
        road_id=site.id,
        plant_id=plant.id,
        plant_name=plant.name,
        vehicles=out_vehicles,
        prep=PrepBreakdown(**prep_dict),
        logistics=LogisticsPlan(**logistics_dict),
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
