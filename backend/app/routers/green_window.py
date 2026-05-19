import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.data_utils import get_site_by_id, load_sites
from app.core.deps import get_http_client
from app.core.geo import haversine_km
from app.db.database import SessionLocal
from app.db.models import PlantORM, SiteORM
from app.schemas.green_window import BrigadeMember, GreenWindow, PrepInfo
from app.services import weather_aggregator
from app.services.dispatch import select_brigade, select_nearest_plant, vehicles_by_ids
from app.services.green_window import calculate_green_windows
from app.services.prep import calc_prep_breakdown, fallback_prep_breakdown

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
    delivery_min = site_orm.delivery_time_min if site_orm else 0

    # Завод: захардкоженный → ближайший
    plant: PlantORM | None = None
    if site_orm and site_orm.plant_id:
        plant = db.query(PlantORM).filter(PlantORM.id == site_orm.plant_id).first()
    if plant is None and site_orm:
        plant = select_nearest_plant(site_orm.lat, site_orm.lon, db)

    # Бригада: явно переданная → авто (если auto=true) → пусто
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

    # Prep breakdown
    if brigade_orm and plant:
        prep_dict = calc_prep_breakdown(brigade_orm, plant.lat, plant.lon, delivery_min)
        has_brigade = True
    else:
        prep_dict = fallback_prep_breakdown(delivery_min)
        has_brigade = False

    prep = PrepInfo(**prep_dict, has_brigade=has_brigade)

    brigade_out: list[BrigadeMember] = []
    if plant:
        for v in brigade_orm:
            km = haversine_km(v.coords[0], v.coords[1], plant.lat, plant.lon) if v.coords else 0.0
            brigade_out.append(BrigadeMember(
                id=v.id,
                type=v.type.value,
                name=v.name,
                to_plant_km=round(km, 2),
                to_plant_min=round(km / 60 * 60, 1),
                capacity_t=v.capacity_t or 0.0,
            ))

    return calculate_green_windows(
        site_schema, forecast.points, prep=prep, brigade=brigade_out,
        plant_name=plant.name if plant else None,
    )
