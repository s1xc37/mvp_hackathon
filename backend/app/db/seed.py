import json
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.database import Base, SessionLocal, engine
from app.db.models import (
    LaneCondition,
    LaneORM,
    LayerType,
    ParkingORM,
    PlantORM,
    SiteORM,
    VehicleORM,
    VehicleType,
)

_DATA = Path(__file__).parent.parent / "data"


def _site_lat_lon(raw: dict) -> tuple[float, float]:
    if "lat" in raw and "lon" in raw:
        return float(raw["lat"]), float(raw["lon"])
    coords = raw["coords"]
    return float(coords[0]), float(coords[1])


def _parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _seed_plants(db: Session) -> None:
    raw = json.loads((_DATA / "plants.json").read_text())
    for p in raw:
        db.add(PlantORM(
            id=p["id"],
            name=p["name"],
            lat=float(p["lat"]),
            lon=float(p["lon"]),
            capacity_t_per_hour=float(p["capacity_t_per_hour"]),
            mix_temp_c=int(p["mix_temp_c"]),
            active=bool(p.get("active", True)),
            materials=p.get("materials", []),
        ))


def _seed_parkings(db: Session) -> None:
    raw = json.loads((_DATA / "parkings.json").read_text())
    for p in raw:
        db.add(ParkingORM(
            id=int(p["id"]),
            name=p["name"],
            coords=p["coords"],
        ))


def _seed_sites_and_lanes(db: Session) -> None:
    raw = json.loads((_DATA / "roads.json").read_text())
    known_plants = {p[0] for p in db.query(PlantORM.id).all()}
    for r in raw:
        lat, lon = _site_lat_lon(r)
        plant_id = r.get("plant_id")
        if plant_id and plant_id not in known_plants:
            # FK на удалённый АБЗ — обнуляем, ближайший подберётся в /paving/route
            plant_id = None
        site = SiteORM(
            id=r["id"],
            numeric_id=int(r.get("numeric_id", 0)),
            name=r["name"],
            km_marker=int(r["km_marker"]),
            lat=lat,
            lon=lon,
            polygon=r["polygon"],
            photo=r.get("photo"),
            width_m=float(r["width_m"]),
            length_m=float(r["length_m"]),
            layer_type=LayerType(r.get("layer_type", "standard")),
            plant_id=plant_id,
            delivery_time_min=int(r["delivery_time_min"]),
            repair_hours=int(r.get("repair_hours", 72)),
            weather_suitable=r.get("weather_suitable"),
            weather_note=r.get("weather_note", ""),
            weather_windows=r.get("weather_windows", []),
        )
        for lane in r.get("lanes", []):
            site.lanes.append(LaneORM(
                num=int(lane["id"]),
                name=lane["name"],
                direction=lane["direction"],
                condition=LaneCondition(lane["condition"]),
                last_paved=_parse_date(lane["last_paved"]),
                repair_hours=int(r.get("repair_hours", 72)),
            ))
        db.add(site)


_DEFAULT_CAPACITY_T: dict[str, float] = {
    "dump_truck": 20.0,
    "transfer_machine": 25.0,
}


def _seed_vehicles(db: Session) -> None:
    raw = json.loads((_DATA / "vehicles.json").read_text())
    for v in raw:
        vtype = v["type"]
        capacity = float(v.get("capacity_t", _DEFAULT_CAPACITY_T.get(vtype, 0.0)))
        db.add(VehicleORM(
            id=int(v["id"]),
            type=VehicleType(vtype),
            name=v["name"],
            coords=v.get("coords"),
            speed_kmh=int(v.get("speed_kmh", 0)),
            current_task=v.get("current_task"),
            location_type=v.get("location_type"),
            location_name=v.get("location_name"),
            home_type=v.get("home_type"),
            home_id=str(v["home_id"]) if v.get("home_id") is not None else None,
            capacity_t=capacity,
            load_t=float(v.get("load_t", 0.0)),
            is_heated=bool(v.get("is_heated", False)),
            schedule=v.get("schedule", []),
        ))


def init_db() -> None:
    """Создать таблицы и заполнить их из JSON, если БД пустая."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(SiteORM).count() > 0:
            return
        _seed_plants(db)
        _seed_parkings(db)
        db.flush()
        _seed_sites_and_lanes(db)
        _seed_vehicles(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
