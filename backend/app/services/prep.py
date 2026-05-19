"""Расчёт времени подготовки бригады и температуры смеси на участке.

prep_total = max(время фуры до АБЗ) + загрузка + доставка с АБЗ → участок.
delivery_min теперь берём по OSRM (реальная дорога), а не site.delivery_time_min.

Дополнительно считается arrival_temp — температура смеси на участке с учётом
типа кузова и расстояния. Если ниже MIX_USABLE_MIN_C — план непригоден.
"""
import httpx

from app.core.constants import (
    COOL_RATE_HEATED,
    MIX_OPTIMAL_MIN_C,
    MIX_USABLE_MIN_C,
    ORDER_LEAD_TIME,
)
from app.core.geo import haversine_km
from app.db.models import PlantORM, VehicleORM, VehicleType
from app.services.cooling import (
    avg_cool_rate,
    cool_rate_waiting,
    drying_time_min,
    required_mix_temp_at_plant,
    temp_after_waiting,
)
from app.services.osrm import fetch_table

LOAD_MINUTES = 30
# Время ожидания смеси на участке (выгрузка → подача в укладчик)
SITE_WAIT_MIN = 10
_HAULER_TYPES = {VehicleType.dump_truck, VehicleType.transfer_machine}


async def _vehicle_to_plant_min(
    haulers: list[VehicleORM], plant_lat: float, plant_lon: float,
    client: httpx.AsyncClient,
) -> tuple[float, list[float]]:
    """Время каждой фуры до АБЗ по OSRM, возвращает (max, per_vehicle)."""
    if not haulers:
        return 0.0, []
    truck_pts = [tuple(v.coords) for v in haulers]
    table = await fetch_table(
        client, sources=truck_pts, destinations=[(plant_lat, plant_lon)],
    )
    per = [row[0] for row in table["durations_min"]]
    return (max(per) if per else 0.0), per


async def calc_prep_breakdown_async(
    vehicles: list[VehicleORM],
    plant: PlantORM,
    site_lat: float,
    site_lon: float,
    client: httpx.AsyncClient,
    air_temp_c: float | None = None,
    wind_ms: float | None = None,
    rain_mm_per_day: float | None = None,
) -> dict:
    """Полный расчёт подготовки с учётом OSRM, остывания и погоды.

    Если переданы air_temp_c/wind_ms — таблица остывания термокузова подбирается
    точнее, плюс считается остывание на участке во время ожидания укладчика.
    rain_mm_per_day влияет на drying_min (просушка покрытия после дождя).

    Возвращает dict с минутами и температурными полями.
    """
    haulers = [v for v in vehicles if v.type in _HAULER_TYPES]

    # to_plant — OSRM-матрица truck→plant
    to_plant_min, _ = await _vehicle_to_plant_min(
        haulers, plant.lat, plant.lon, client,
    )

    # delivery — OSRM-маршрут АБЗ→участок
    deliv_table = await fetch_table(
        client, sources=[(plant.lat, plant.lon)], destinations=[(site_lat, site_lon)],
    )
    delivery_min = (
        deliv_table["durations_min"][0][0] if deliv_table["durations_min"] else 0.0
    )

    # Температурный блок: учитываем воздух из прогноза
    rate_truck = avg_cool_rate(haulers, air_temp_c)
    arrival_truck_c = plant.mix_temp_c - rate_truck * delivery_min
    # Дальше остывание на участке во время ожидания подачи в укладчик
    rate_wait = cool_rate_waiting(air_temp_c, wind_ms)
    arrival_c = arrival_truck_c - rate_wait * SITE_WAIT_MIN

    dump_trucks = [v for v in haulers if v.type == VehicleType.dump_truck]
    heated = sum(1 for v in dump_trucks if v.is_heated)
    heated_share = heated / len(dump_trucks) if dump_trucks else 0.0
    all_heated = bool(dump_trucks) and heated == len(dump_trucks)

    # С какой температуры нужно отгружать на АБЗ
    required_temp = required_mix_temp_at_plant(
        delivery_min, SITE_WAIT_MIN, air_temp_c, wind_ms, heated=all_heated,
    )

    drying = drying_time_min(rain_mm_per_day)

    return {
        "to_plant_min": round(to_plant_min, 1),
        "load_min": LOAD_MINUTES,
        "delivery_min": round(delivery_min, 1),
        "total_min": round(to_plant_min + LOAD_MINUTES + delivery_min, 1),
        "mix_temp_start_c": float(plant.mix_temp_c),
        "mix_temp_arrival_c": round(arrival_c, 1),
        "mix_usable": arrival_c >= MIX_USABLE_MIN_C,
        "mix_optimal": arrival_c >= MIX_OPTIMAL_MIN_C,
        "heated_share": round(heated_share, 2),
        "cool_rate": round(rate_truck, 3),
        "cool_rate_waiting": round(rate_wait, 3),
        "site_wait_min": SITE_WAIT_MIN,
        "required_mix_temp_c": required_temp,
        "drying_min": drying,
        "air_temp_c": air_temp_c,
        "wind_ms": wind_ms,
    }


def calc_prep_breakdown(
    vehicles: list[VehicleORM],
    plant_lat: float,
    plant_lon: float,
    delivery_min: int,
) -> dict:
    """Legacy-обёртка без OSRM и температурного блока (для совместимости)."""
    haulers = [v for v in vehicles if v.type in _HAULER_TYPES]
    durations = [
        haversine_km(v.coords[0], v.coords[1], plant_lat, plant_lon) / 60 * 60
        if v.coords else 0.0
        for v in haulers
    ]
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
    rest = max(0.0, total - LOAD_MINUTES - delivery_min)
    return {
        "to_plant_min": round(rest, 1),
        "load_min": LOAD_MINUTES,
        "delivery_min": delivery_min,
        "total_min": float(total),
    }
