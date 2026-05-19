"""Расчёт времени подготовки бригады к укладке.

Подготовка = max(время пути техники до АБЗ) + загрузка фуры + доставка с АБЗ.
Фолбэк (если бригада не выбрана) — норматив ORDER_LEAD_TIME из ГОСТ-кейса (4 часа).
"""
from app.core.constants import ORDER_LEAD_TIME
from app.core.geo import haversine_km
from app.db.models import VehicleORM, VehicleType

# Виртуальные минуты на загрузку самосвалов на АБЗ
LOAD_MINUTES = 30
# Средняя «дорожная» скорость для оценки времени пути без OSRM
_AVG_KMH = 60.0
_HAULER_TYPES = {VehicleType.dump_truck, VehicleType.transfer_machine}


def _vehicle_to_plant_min(v: VehicleORM, plant_lat: float, plant_lon: float) -> float:
    if not v.coords:
        return 0.0
    km = haversine_km(v.coords[0], v.coords[1], plant_lat, plant_lon)
    return km / _AVG_KMH * 60.0


def calc_prep_breakdown(
    vehicles: list[VehicleORM],
    plant_lat: float,
    plant_lon: float,
    delivery_min: int,
) -> dict:
    """Считает подготовку для конкретной бригады.

    Возвращает dict с минутами:
      to_plant_min — самая дальняя машина-перевозчик до АБЗ
      load_min     — загрузка
      delivery_min — АБЗ → участок (приходит из site.delivery_time_min)
      total_min    — сумма
    """
    haulers = [v for v in vehicles if v.type in _HAULER_TYPES]
    durations = [_vehicle_to_plant_min(v, plant_lat, plant_lon) for v in haulers]
    to_plant = max(durations) if durations else 0.0

    return {
        "to_plant_min": round(to_plant, 1),
        "load_min": LOAD_MINUTES,
        "delivery_min": delivery_min,
        "total_min": round(to_plant + LOAD_MINUTES + delivery_min, 1),
    }


def fallback_prep_breakdown(delivery_min: int) -> dict:
    """Норматив без выбранной бригады: ORDER_LEAD_TIME часов суммарно."""
    total = ORDER_LEAD_TIME * 60
    # Распределим: оставшееся после доставки и загрузки уходит на «путь техники»
    rest = max(0.0, total - LOAD_MINUTES - delivery_min)
    return {
        "to_plant_min": round(rest, 1),
        "load_min": LOAD_MINUTES,
        "delivery_min": delivery_min,
        "total_min": float(total),
    }
