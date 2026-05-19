from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import ParkingORM, PlantORM, VehicleORM
from app.schemas.parking import Parking, ParkingDetail
from app.schemas.plant import Plant, PlantDetail
from app.schemas.vehicle import ScheduleEntry, Vehicle, VehicleSummary


def _vehicle_summary(v: VehicleORM) -> VehicleSummary:
    return VehicleSummary(
        id=v.id,
        type=v.type.value,
        name=v.name,
        coords=v.coords,
        speed_kmh=v.speed_kmh or 0,
        current_task=v.current_task,
        location_type=v.location_type,
        location_name=v.location_name,
        home_type=v.home_type,
        home_id=_cast_home_id(v.home_id),
        capacity_t=v.capacity_t or 0.0,
        load_t=v.load_t or 0.0,
    )


def _vehicle_full(v: VehicleORM) -> Vehicle:
    return Vehicle(
        id=v.id,
        type=v.type.value,
        name=v.name,
        coords=v.coords,
        speed_kmh=v.speed_kmh or 0,
        current_task=v.current_task,
        location_type=v.location_type,
        location_name=v.location_name,
        home_type=v.home_type,
        home_id=_cast_home_id(v.home_id),
        capacity_t=v.capacity_t or 0.0,
        load_t=v.load_t or 0.0,
        schedule=[ScheduleEntry(**e) for e in (v.schedule or [])],
    )


def _cast_home_id(value: str | None) -> int | str | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return value


def _plant_pydantic(p: PlantORM, vehicle_ids: list[int]) -> Plant:
    return Plant(
        id=p.id,
        name=p.name,
        lat=p.lat,
        lon=p.lon,
        capacity_t_per_hour=p.capacity_t_per_hour,
        mix_temp_c=p.mix_temp_c,
        active=p.active,
        materials=p.materials or [],
        vehicle_ids=vehicle_ids,
    )


def _with_db(db: Session | None):
    if db is not None:
        return db, False
    return SessionLocal(), True


def list_vehicles(type_filter: str | None = None, db: Session | None = None) -> list[VehicleSummary]:
    session, owned = _with_db(db)
    try:
        q = session.query(VehicleORM)
        rows = q.all()
        if type_filter:
            rows = [r for r in rows if r.type.value == type_filter]
        return [_vehicle_summary(v) for v in rows]
    finally:
        if owned:
            session.close()


def get_vehicle(vehicle_id: int, db: Session | None = None) -> Vehicle | None:
    session, owned = _with_db(db)
    try:
        v = session.query(VehicleORM).filter(VehicleORM.id == vehicle_id).first()
        return _vehicle_full(v) if v else None
    finally:
        if owned:
            session.close()


def list_parkings(db: Session | None = None) -> list[Parking]:
    session, owned = _with_db(db)
    try:
        parkings = session.query(ParkingORM).order_by(ParkingORM.id).all()
        vehicles = session.query(VehicleORM).all()
        out: list[Parking] = []
        for p in parkings:
            count = sum(1 for v in vehicles if v.home_type == "parking" and _cast_home_id(v.home_id) == p.id)
            out.append(Parking(id=p.id, name=p.name, coords=p.coords, vehicle_count=count))
        return out
    finally:
        if owned:
            session.close()


def get_parking(parking_id: int, db: Session | None = None) -> ParkingDetail | None:
    session, owned = _with_db(db)
    try:
        p = session.query(ParkingORM).filter(ParkingORM.id == parking_id).first()
        if not p:
            return None
        vehicles = session.query(VehicleORM).all()
        assigned = [
            _vehicle_summary(v)
            for v in vehicles
            if v.home_type == "parking" and _cast_home_id(v.home_id) == parking_id
        ]
        return ParkingDetail(
            id=p.id,
            name=p.name,
            coords=p.coords,
            vehicle_count=len(assigned),
            vehicles=assigned,
        )
    finally:
        if owned:
            session.close()


def list_plants(db: Session | None = None) -> list[Plant]:
    session, owned = _with_db(db)
    try:
        plants = session.query(PlantORM).all()
        vehicles = session.query(VehicleORM).all()
        out: list[Plant] = []
        for p in plants:
            ids = [v.id for v in vehicles if v.home_type == "factory" and v.home_id == p.id]
            out.append(_plant_pydantic(p, ids))
        return out
    finally:
        if owned:
            session.close()


def get_plant_detail(plant_id: str, db: Session | None = None) -> PlantDetail | None:
    session, owned = _with_db(db)
    try:
        p = session.query(PlantORM).filter(PlantORM.id == plant_id).first()
        if not p:
            return None
        vehicles = session.query(VehicleORM).all()
        plant_vehicles = [_vehicle_summary(v) for v in vehicles if v.home_type == "factory" and v.home_id == plant_id]
        plant = _plant_pydantic(p, [v.id for v in plant_vehicles])
        return PlantDetail(**plant.model_dump(), vehicles=plant_vehicles, vehicle_count=len(plant_vehicles))
    finally:
        if owned:
            session.close()


def vehicles_for_plant(plant_id: str, db: Session | None = None) -> list[VehicleSummary]:
    session, owned = _with_db(db)
    try:
        vehicles = session.query(VehicleORM).filter(
            VehicleORM.home_type == "factory",
            VehicleORM.home_id == plant_id,
        ).all()
        return [_vehicle_summary(v) for v in vehicles]
    finally:
        if owned:
            session.close()
