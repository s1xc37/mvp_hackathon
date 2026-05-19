"""Подбор ближайшего/оптимального завода и техники для укладки.

Выбор АБЗ учитывает не только расстояние, но и реальное время доставки по дорогам
(OSRM) и остывание смеси в кузове. Завод отбрасывается, если ни одна доступная фура
не довезёт горячую смесь (≥ MIX_USABLE_MIN_C).
"""
import httpx
from sqlalchemy.orm import Session

from app.core.constants import MIX_USABLE_MIN_C
from app.core.geo import haversine_km
from app.db.models import PlantORM, VehicleORM, VehicleType
from app.services.cooling import arrival_temp_c, cool_rate_truck
from app.services.osrm import fetch_table


def _dump_truck_count(repair_hours: int) -> int:
    return max(2, round(repair_hours / 36))


_BRIGADE_FIXED: dict[VehicleType, int] = {
    VehicleType.paver: 1,
    VehicleType.transfer_machine: 1,
    VehicleType.roller: 2,
    VehicleType.closure_vehicle: 1,
}


def select_nearest_plant(lat: float, lon: float, db: Session) -> PlantORM | None:
    """Legacy fallback — ближайший активный АБЗ по haversine."""
    plants = db.query(PlantORM).filter(PlantORM.active.is_(True)).all()
    if not plants:
        return None
    return min(plants, key=lambda p: haversine_km(lat, lon, p.lat, p.lon))


async def select_best_plant(
    site_lat: float,
    site_lon: float,
    db: Session,
    client: httpx.AsyncClient,
    fleet_pool: list[VehicleORM] | None = None,
) -> tuple[PlantORM | None, dict]:
    """Выбрать АБЗ с учётом дорожной доставки и остывания.

    Возвращает (plant, info), где info содержит:
        delivery_min: реальное время доставки по OSRM (или fallback)
        arrival_temp_c: температура смеси на участке при использовании этого АБЗ
        best_truck: лучший dump_truck для этого АБЗ (None если все слишком далеко)
        rejected: список (plant_id, reason) — почему другие АБЗ не подошли
    """
    plants = db.query(PlantORM).filter(PlantORM.active.is_(True)).all()
    if not plants:
        return None, {"delivery_min": 0.0, "arrival_temp_c": None, "rejected": []}

    # 1) Матрица AБЗ → участок (один запрос, обычно 3-9 заводов)
    site_pt = (site_lat, site_lon)
    plant_pts = [(p.lat, p.lon) for p in plants]
    table = await fetch_table(client, sources=plant_pts, destinations=[site_pt])
    plant_to_site_min = [row[0] for row in table["durations_min"]]
    plant_to_site_km = [row[0] for row in table["distances_km"]]

    # 2) Пул фур: либо переданный, либо все dump_truck'и с координатами
    if fleet_pool is None:
        fleet_pool = (
            db.query(VehicleORM)
            .filter(
                VehicleORM.type == VehicleType.dump_truck,
                VehicleORM.coords.is_not(None),
            )
            .all()
        )
    haulers = [v for v in fleet_pool if v.type == VehicleType.dump_truck and v.coords]

    rejected: list[dict] = []
    candidates: list[dict] = []

    for plant, delivery_min, dist_km in zip(plants, plant_to_site_min, plant_to_site_km):
        if not haulers:
            # Нет фур — просто проверяем «теоретическую» доставку термокузовом
            class _Fake:
                type = VehicleType.dump_truck
                is_heated = True
            arr = arrival_temp_c(plant.mix_temp_c, _Fake(), delivery_min)
            if arr < MIX_USABLE_MIN_C:
                rejected.append({"plant_id": plant.id, "arrival_c": round(arr, 1),
                                 "reason": "Смесь остынет ниже 140°C даже с термокузовом"})
                continue
            candidates.append({
                "plant": plant, "delivery_min": delivery_min,
                "dist_km": dist_km, "arrival_c": arr, "best_truck": None,
            })
            continue

        # Лучший hauler: максимум arrival_temp при перевозке именно этим грузовиком
        best = None
        for v in haulers:
            arr = arrival_temp_c(plant.mix_temp_c, v, delivery_min)
            if best is None or arr > best[1]:
                best = (v, arr)
        truck, arr = best
        if arr < MIX_USABLE_MIN_C:
            rejected.append({
                "plant_id": plant.id, "arrival_c": round(arr, 1),
                "reason": f"Даже лучшая фура ({truck.name}) довезёт {arr:.0f}°C",
            })
            continue

        candidates.append({
            "plant": plant, "delivery_min": delivery_min,
            "dist_km": dist_km, "arrival_c": arr, "best_truck": truck,
        })

    if not candidates:
        return None, {"delivery_min": 0.0, "arrival_temp_c": None, "rejected": rejected}

    # 3) Скор: запас по температуре + производительность - штраф за километры
    def score(c: dict) -> float:
        temp_margin = c["arrival_c"] - MIX_USABLE_MIN_C
        return temp_margin + c["plant"].capacity_t_per_hour / 100 - c["dist_km"] * 0.3

    best = max(candidates, key=score)
    return best["plant"], {
        "delivery_min": round(best["delivery_min"], 1),
        "delivery_km": round(best["dist_km"], 2),
        "arrival_temp_c": round(best["arrival_c"], 1),
        "best_truck_id": best["best_truck"].id if best["best_truck"] else None,
        "rejected": rejected,
    }


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
    """Подобрать ближайшую к участку технику всех нужных типов.

    Самосвалы дополнительно сортируются с приоритетом термокузовов: при равных
    расстояниях is_heated=True предпочтительнее.
    """
    chosen: list[VehicleORM] = []
    chosen_ids: set[int] = set()

    counts: dict[VehicleType, int] = {
        VehicleType.dump_truck: _dump_truck_count(repair_hours),
        **_BRIGADE_FIXED,
    }
    for vtype, n in counts.items():
        if vtype == VehicleType.dump_truck:
            pool = (
                db.query(VehicleORM)
                .filter(VehicleORM.type == vtype, VehicleORM.coords.is_not(None))
                .all()
            )
            pool = [v for v in pool if v.id not in chosen_ids and v.coords]
            # Сначала по расстоянию, при равных — термокузов в приоритете
            pool.sort(key=lambda v: (
                haversine_km(site_lat, site_lon, v.coords[0], v.coords[1]),
                0 if v.is_heated else 1,
            ))
            picked = pool[:n]
        else:
            picked = _nearest_of_type(vtype, n, site_lat, site_lon, db, chosen_ids)
        chosen.extend(picked)
        chosen_ids.update(v.id for v in picked)
    return chosen


def vehicles_by_ids(ids: list[int], db: Session) -> list[VehicleORM]:
    rows = db.query(VehicleORM).filter(VehicleORM.id.in_(ids)).all()
    by_id = {v.id: v for v in rows}
    return [by_id[i] for i in ids if i in by_id]
