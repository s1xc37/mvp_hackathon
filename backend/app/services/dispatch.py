"""Подбор ближайшего завода и техники для укладки."""
from sqlalchemy.orm import Session

from app.core.geo import haversine_km
from app.db.models import PlantORM, VehicleORM, VehicleType


# Сколько техники каждого типа нужно в бригаде
def _dump_truck_count(repair_hours: int) -> int:
    return max(2, round(repair_hours / 36))


_BRIGADE_FIXED: dict[VehicleType, int] = {
    VehicleType.paver: 1,
    VehicleType.transfer_machine: 1,
    VehicleType.roller: 2,
    VehicleType.closure_vehicle: 1,
}


def select_nearest_plant(lat: float, lon: float, db: Session) -> PlantORM | None:
    """Ближайший активный завод по haversine."""
    plants = db.query(PlantORM).filter(PlantORM.active.is_(True)).all()
    if not plants:
        return None
    return min(plants, key=lambda p: haversine_km(lat, lon, p.lat, p.lon))


def _nearest_of_type(
    vtype: VehicleType, count: int, lat: float, lon: float, db: Session,
    exclude_ids: set[int],
) -> list[VehicleORM]:
    candidates = (
        db.query(VehicleORM)
        .filter(VehicleORM.type == vtype, VehicleORM.coords.is_not(None))
        .all()
    )
    candidates = [v for v in candidates if v.id not in exclude_ids and v.coords]
    candidates.sort(key=lambda v: haversine_km(lat, lon, v.coords[0], v.coords[1]))
    return candidates[:count]


def select_brigade(
    site_lat: float, site_lon: float, repair_hours: int, db: Session,
) -> list[VehicleORM]:
    """Подобрать ближайшую к участку технику всех нужных типов."""
    chosen: list[VehicleORM] = []
    chosen_ids: set[int] = set()

    counts: dict[VehicleType, int] = {
        VehicleType.dump_truck: _dump_truck_count(repair_hours),
        **_BRIGADE_FIXED,
    }
    for vtype, n in counts.items():
        picked = _nearest_of_type(vtype, n, site_lat, site_lon, db, chosen_ids)
        chosen.extend(picked)
        chosen_ids.update(v.id for v in picked)
    return chosen


def vehicles_by_ids(ids: list[int], db: Session) -> list[VehicleORM]:
    """Достать машины по списку id, в том же порядке."""
    rows = db.query(VehicleORM).filter(VehicleORM.id.in_(ids)).all()
    by_id = {v.id: v for v in rows}
    return [by_id[i] for i in ids if i in by_id]
