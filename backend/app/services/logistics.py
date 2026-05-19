"""Расчёт оптимального заказа смеси с учётом остывания.

Цель: не заказывать больше, чем удастся уложить горячим. Если бригаде
доступно укладки на 25 т, а каждая фура везёт 20 т — экономим 15 т из 40.

Формула:
    paving_rate     = т/мин укладчика
    total_demand    = paving_rate × effective_window_min  (сколько успеем уложить)
    T_arrival       = mix_temp − cool_rate × delivery     (T в кузове на участке)
    temp_life_after = (T_arrival − 140) / cool_rate_wait  (сколько живёт после прибытия)
    max_per_trip    = min(capacity, temp_life × paving_rate)  (температурный лимит рейса)
    target_per_truck = min(max_per_trip, demand / n_trucks)   (равномерное распределение)
    trips_per_truck = ceil(demand / (n_trucks × target_per_truck))
    interval_min    = target_per_truck / paving_rate           (интервал подачи фур)
"""
from math import ceil

from app.core.constants import MIX_USABLE_MIN_C


_MIN_LOAD_T = 5.0  # ниже этого порога фуру отправлять бессмысленно


def calc_optimal_order(
    rate_t_per_min: float,
    effective_paving_min: float,
    mix_temp_c: float,
    cool_rate: float,
    cool_rate_waiting: float,
    delivery_min: float,
    n_trucks: int,
    truck_capacity_t: float,
    min_usable_c: float = MIX_USABLE_MIN_C,
) -> dict:
    """Возвращает план логистики.

    Поля результата:
        total_demand_t           — сколько физически нужно (укладчик × окно)
        target_load_per_truck_t  — рекомендация: грузить столько в каждую фуру
        max_load_per_trip_t      — потолок по температуре (выше — холодная смесь в остатках)
        trips_per_truck          — рейсов на фуру за окно
        interval_min             — интервал между рейсами (конвейер)
        savings_t                — экономия vs полная загрузка
        savings_pct              — % экономии
        bottleneck               — что лимитирует: 'window' | 'temperature' | 'capacity'
    """
    if n_trucks <= 0 or rate_t_per_min <= 0 or effective_paving_min <= 0:
        return _empty(truck_capacity_t)

    # 1. Потребность
    total_demand_t = rate_t_per_min * effective_paving_min

    # 2. Температурный лимит на один рейс
    arrival_c = mix_temp_c - cool_rate * delivery_min
    if arrival_c < min_usable_c or cool_rate_waiting <= 0:
        # Смесь не доедет горячей — система должна была это поймать раньше
        max_per_trip = 0.0
    else:
        temp_life_min = (arrival_c - min_usable_c) / cool_rate_waiting
        max_per_trip = min(truck_capacity_t, temp_life_min * rate_t_per_min)

    # 3. Целевая загрузка: распределяем потребность равномерно по фурам
    if max_per_trip <= 0:
        target = 0.0
    else:
        target = min(max_per_trip, total_demand_t / n_trucks)
        # минимум: не грузить меньше _MIN_LOAD_T если потребность есть
        if 0 < target < _MIN_LOAD_T:
            target = min(_MIN_LOAD_T, max_per_trip)

    # 4. Сколько рейсов нужно
    if target > 0:
        trips = max(1, ceil(total_demand_t / (n_trucks * target)))
    else:
        trips = 0

    # 5. Интервал конвейера
    interval = target / rate_t_per_min if rate_t_per_min > 0 and target > 0 else 0.0

    # 6. Экономия
    full_load_t = n_trucks * truck_capacity_t * max(1, trips)
    actual_t = n_trucks * target * trips
    savings = max(0.0, full_load_t - actual_t)
    savings_pct = (savings / full_load_t * 100) if full_load_t > 0 else 0.0

    # 7. Что лимитирует
    if target >= truck_capacity_t * 0.99:
        bottleneck = "capacity"     # фура — узкое место, можно бы возить больше но кузов мал
    elif max_per_trip < total_demand_t / n_trucks:
        bottleneck = "temperature"  # лимитирует температурное окно жизни смеси
    else:
        bottleneck = "window"       # лимитирует длительность зелёного окна

    return {
        "total_demand_t": round(total_demand_t, 1),
        "target_load_per_truck_t": round(target, 1),
        "max_load_per_trip_t": round(max_per_trip, 1),
        "trips_per_truck": trips,
        "trips_total": trips * n_trucks,
        "interval_min": round(interval, 1),
        "savings_t": round(savings, 1),
        "savings_pct": round(savings_pct, 1),
        "bottleneck": bottleneck,
        "n_trucks": n_trucks,
        "truck_capacity_t": round(truck_capacity_t, 1),
        "arrival_temp_c": round(arrival_c, 1),
    }


def _empty(capacity_t: float) -> dict:
    return {
        "total_demand_t": 0.0,
        "target_load_per_truck_t": 0.0,
        "max_load_per_trip_t": 0.0,
        "trips_per_truck": 0,
        "trips_total": 0,
        "interval_min": 0.0,
        "savings_t": 0.0,
        "savings_pct": 0.0,
        "bottleneck": "window",
        "n_trucks": 0,
        "truck_capacity_t": capacity_t,
        "arrival_temp_c": 0.0,
    }
