from sqlalchemy.orm import Session, joinedload

from app.db.database import SessionLocal
from app.db.models import SiteORM
from app.schemas.lane import Lane
from app.schemas.site import Site


def _site_orm_to_pydantic(s: SiteORM) -> Site:
    return Site(
        id=s.id,
        numeric_id=s.numeric_id or 0,
        name=s.name,
        km_marker=s.km_marker,
        lat=s.lat,
        lon=s.lon,
        coords=[s.lat, s.lon],
        polygon=s.polygon,
        photo=s.photo,
        lanes=[
            Lane(
                id=l.num,
                name=l.name,
                direction=l.direction,
                condition=l.condition.value,
                last_paved=l.last_paved,
            )
            for l in s.lanes
        ],
        width_m=s.width_m,
        length_m=s.length_m,
        layer_type=s.layer_type.value,
        plant_id=s.plant_id or "",
        delivery_time_min=s.delivery_time_min,
        repair_hours=s.repair_hours or 72,
        weather_suitable=s.weather_suitable,
        weather_note=s.weather_note or "",
        weather_windows=s.weather_windows or [],
    )


def load_sites(db: Session | None = None) -> list[Site]:
    own = db is None
    if own:
        db = SessionLocal()
    try:
        rows = db.query(SiteORM).options(joinedload(SiteORM.lanes)).order_by(SiteORM.numeric_id).all()
        return [_site_orm_to_pydantic(s) for s in rows]
    finally:
        if own:
            db.close()


def get_site_by_id(site_id: str, db: Session | None = None) -> Site | None:
    own = db is None
    if own:
        db = SessionLocal()
    try:
        row = (
            db.query(SiteORM)
            .options(joinedload(SiteORM.lanes))
            .filter((SiteORM.id == site_id) | (SiteORM.numeric_id == _try_int(site_id)))
            .first()
        )
        return _site_orm_to_pydantic(row) if row else None
    finally:
        if own:
            db.close()


def _try_int(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1
