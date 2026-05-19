"""Расчёт остывания асфальтобетонной смеси.

Две фазы:
  1. В кузове во время доставки — скорость зависит от типа кузова (термо/обычный)
     и температуры воздуха (HEATED_TRUCK_COOL_RATES).
  2. На участке после выгрузки во время ожидания укладчика — формула
     0.20 + wind*0.05 + (20 - T_air)*0.02, не ниже 0.15.

Математическая модель взята из инженерной утилиты проекта (БлаБлаБла.py).
"""
from app.core.constants import (
    COOL_RATE_HEATED,
    COOL_RATE_TIPPER,
    HEATED_TRUCK_COOL_RATES,
    MIX_USABLE_MIN_C,
)
from app.db.models import VehicleORM, VehicleType


def cool_rate_truck_heated(air_temp_c: float | None) -> float:
    """Скорость остывания в термокузове, °C/мин — по таблице от температуры воздуха."""
    if air_temp_c is None:
        return COOL_RATE_HEATED
    # Идём от тёплого к холодному
    for threshold in sorted(HEATED_TRUCK_COOL_RATES.keys(), reverse=True):
        if air_temp_c >= threshold:
            return HEATED_TRUCK_COOL_RATES[threshold]
    return 0.45  # < −10°C


def cool_rate_truck(vehicle: VehicleORM, air_temp_c: float | None = None) -> float:
    """Полная скорость остывания смеси в кузове, °C/мин."""
    if vehicle.type != VehicleType.dump_truck:
        # Перегружатель — изоляция близкая к термокузову
        return cool_rate_truck_heated(air_temp_c)
    if vehicle.is_heated:
        return cool_rate_truck_heated(air_temp_c)
    # Обычный самосвал — базовая ставка + корректировка на холод (≈0.02/°C ниже +15)
    rate = COOL_RATE_TIPPER
    if air_temp_c is not None and air_temp_c < 15:
        rate *= 1.0 + 0.02 * (15 - air_temp_c)
    return rate


def cool_rate_waiting(air_temp_c: float | None, wind_ms: float | None) -> float:
    """Скорость остывания смеси на участке при ожидании укладчика, °C/мин.

    Формула из инженерной модели: 0.20 + wind*0.05 + (20 - T_air)*0.02, min 0.15.
    Смесь на открытом воздухе теряет тепло быстрее чем в кузове.
    """
    t = 20.0 if air_temp_c is None else air_temp_c
    w = 0.0 if wind_ms is None else wind_ms
    return max(0.15, 0.20 + w * 0.05 + (20.0 - t) * 0.02)


def arrival_temp_c(
    mix_temp_c: float,
    vehicle: VehicleORM,
    transit_min: float,
    air_temp_c: float | None = None,
    wind_ms: float | None = None,
) -> float:
    """Температура смеси в кузове через transit_min минут пути."""
    rate = cool_rate_truck(vehicle, air_temp_c)
    return mix_temp_c - rate * transit_min


def temp_after_waiting(
    start_temp_c: float,
    wait_min: float,
    air_temp_c: float | None,
    wind_ms: float | None,
) -> float:
    """Температура смеси после wait_min минут ожидания на участке."""
    rate = cool_rate_waiting(air_temp_c, wind_ms)
    return start_temp_c - rate * wait_min


def required_mix_temp_at_plant(
    delivery_min: float,
    wait_min: float,
    air_temp_c: float | None,
    wind_ms: float | None,
    heated: bool = True,
    min_usable: float = MIX_USABLE_MIN_C,
) -> float:
    """С какой температуры грузить на АБЗ, чтобы доехать ≥ min_usable.

    T_plant = min_usable + cool_truck × delivery + cool_wait × wait
    """
    if heated:
        rate_truck = cool_rate_truck_heated(air_temp_c)
    else:
        rate_truck = COOL_RATE_TIPPER
        if air_temp_c is not None and air_temp_c < 15:
            rate_truck *= 1.0 + 0.02 * (15 - air_temp_c)
    rate_wait = cool_rate_waiting(air_temp_c, wind_ms)
    return round(min_usable + rate_truck * delivery_min + rate_wait * wait_min, 1)


def max_transit_min(
    mix_temp_c: float,
    vehicle: VehicleORM,
    min_usable: float = MIX_USABLE_MIN_C,
    air_temp_c: float | None = None,
    wind_ms: float | None = None,
) -> float:
    rate = cool_rate_truck(vehicle, air_temp_c)
    if rate <= 0:
        return float("inf")
    return max(0.0, (mix_temp_c - min_usable) / rate)


def avg_cool_rate(
    vehicles: list[VehicleORM], air_temp_c: float | None = None,
) -> float:
    """Худшая скорость остывания среди dump_truck'ов бригады (диктует самая холодная фура)."""
    haulers = [v for v in vehicles if v.type == VehicleType.dump_truck]
    if not haulers:
        return cool_rate_truck_heated(air_temp_c)
    return max(cool_rate_truck(v, air_temp_c) for v in haulers)


# Время просушки участка после дождя за сутки, минут
def drying_time_min(rain_mm_per_day: float | None) -> int:
    """Сколько минут нужно ждать пока высохнет покрытие после дождя."""
    if not rain_mm_per_day or rain_mm_per_day <= 0:
        return 0
    if rain_mm_per_day <= 2:
        return 30
    if rain_mm_per_day <= 5:
        return 60
    return 120
