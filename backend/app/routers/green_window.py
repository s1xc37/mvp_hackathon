import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.data_utils import get_site_by_id, load_sites
from app.core.deps import get_http_client
from app.db.database import SessionLocal
from app.db.models import PlantORM, SiteORM
from app.schemas.green_window import BrigadeMember, GreenWindow, PrepInfo
from app.services import weather_aggregator
from app.services.dispatch import select_brigade, select_nearest_plant, vehicles_by_ids
from app.services.green_window import calculate_green_windows
from app.services.osrm import fetch_table
from app.services.prep import (
    calc_prep_breakdown_async,
    fallback_prep_breakdown,
)

router = APIRouter(prefix="/api/green-windows", tags=["green-windows"])


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=list[GreenWindow])
async def list_green_windows(
    client: httpx.AsyncClient = Depends(get_http_client),
) -> list[GreenWindow]:
    sites = load_sites()
    results: list[GreenWindow] = []
    for site in sites:
        forecast = await weather_aggregator.get_forecast(site.id, site.lat, site.lon, client)
        results.append(calculate_green_windows(site, forecast.points))
    return results


@router.get("/{site_id}", response_model=GreenWindow)
async def get_green_window(
    site_id: str,
    vehicle_ids: str | None = Query(None, description="csv id-шников выбранной техники"),
    auto: bool = Query(False, description="если true и нет vehicle_ids — подобрать бригаду автоматически"),
    client: httpx.AsyncClient = Depends(get_http_client),
    db: Session = Depends(_get_db),
) -> GreenWindow:
    site_schema = get_site_by_id(site_id)
    if not site_schema:
        raise HTTPException(status_code=404, detail="Участок не найден")

    forecast = await weather_aggregator.get_forecast(
        site_schema.id, site_schema.lat, site_schema.lon, client,
    )

    site_orm = db.query(SiteORM).filter(SiteORM.id == site_id).first()
    delivery_fallback_min = site_orm.delivery_time_min if site_orm else 0

    # Завод: захардкоженный → ближайший
    plant: PlantORM | None = None
    if site_orm and site_orm.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == site_orm.plant_id).first()
    if plant is None and site_orm:
        plant = select_nearest_plant(site_orm.lat, site_orm.lon, db)

    # Бригада
    ids: list[int] = []
    if vehicle_ids:
        try:
            ids = [int(s) for s in vehicle_ids.split(",") if s.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="vehicle_ids должен быть csv чисел")

    brigade_orm = []
    if ids:
        brigade_orm = vehicles_by_ids(ids, db)
    elif auto and site_orm:
        brigade_orm = select_brigade(site_orm.lat, site_orm.lon, site_orm.repair_hours or 72, db)

    # Текущая погода для расчёта остывания (берём первую точку прогноза)
    first = forecast.points[0] if forecast.points else None
    air_temp_c = first.temp_c if first else None
    wind_ms = first.wind_ms if first else None
    # Накопленные осадки за ближайшие 24 часа (для просушки)
    rain_24h_mm = sum(p.precip_mm for p in forecast.points[:24]) if forecast.points else 0.0

    # Prep — теперь с OSRM, температурой и погодой
    if brigade_orm and plant and site_orm:
        prep_dict = await calc_prep_breakdown_async(
            brigade_orm, plant, site_orm.lat, site_orm.lon, client,
            air_temp_c=air_temp_c, wind_ms=wind_ms, rain_mm_per_day=rain_24h_mm,
        )
        has_brigade = True
    else:
        prep_dict = fallback_prep_breakdown(delivery_fallback_min)
        has_brigade = False

    prep = PrepInfo(**prep_dict, has_brigade=has_brigade)

    # Бригада: время до АБЗ через OSRM table
    brigade_out: list[BrigadeMember] = []
    if plant and brigade_orm:
        truck_pts = [tuple(v.coords) for v in brigade_orm if v.coords]
        table = await fetch_table(
            client, sources=truck_pts, destinations=[(plant.lat, plant.lon)],
        )
        durs = [row[0] for row in table["durations_min"]]
        dists = [row[0] for row in table["distances_km"]]
        idx = 0
        for v in brigade_orm:
            if not v.coords:
                continue
            brigade_out.append(BrigadeMember(
                id=v.id,
                type=v.type.value,
                name=v.name,
                to_plant_km=round(dists[idx], 2),
                to_plant_min=round(durs[idx], 1),
                capacity_t=v.capacity_t or 0.0,
                is_heated=bool(v.is_heated),
            ))
            idx += 1

    return calculate_green_windows(
        site_schema, forecast.points, prep=prep, brigade=brigade_out,
        plant_name=plant.name if plant else None,
        plant_capacity_t_per_hour=plant.capacity_t_per_hour if plant else None,
    )
