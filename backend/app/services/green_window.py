from datetime import datetime, timedelta

from app.core.constants import (
    MAX_WIND_SPEED,
    MIN_TEMP_STANDARD,
    MIN_TEMP_THIN,
    ORDER_LEAD_TIME,
    PAVING_SPEED_AVG,
    ASPHALT_DENSITY,
    LAYER_THICKNESS_STANDARD,
    LAYER_THICKNESS_THIN,
)
from app.schemas.green_window import BrigadeMember, GreenWindow, PrepInfo, TimeSlot
from app.schemas.site import Site
from app.schemas.weather import WeatherPoint


def _is_ok(point: WeatherPoint, layer_type: str) -> tuple[bool, list[str]]:
    issues: list[str] = []
    min_temp = MIN_TEMP_THIN if layer_type == "thin" else MIN_TEMP_STANDARD
    if point.temp_c < min_temp:
        issues.append(f"Температура {point.temp_c:.1f}°C ниже минимума {min_temp}°C")
    if point.wind_ms > MAX_WIND_SPEED:
        issues.append(f"Ветер {point.wind_ms:.1f} м/с > {MAX_WIND_SPEED} м/с")
    if point.has_precipitation or point.precip_mm > 0:
        desc = point.description if point.has_precipitation else f"{point.precip_mm:.1f} мм"
        issues.append(f"Осадки: {desc}")
    return len(issues) == 0, issues


def _tonnage_per_min(site: Site) -> float:
    thickness = LAYER_THICKNESS_THIN if site.layer_type == "thin" else LAYER_THICKNESS_STANDARD
    return site.width_m * PAVING_SPEED_AVG * thickness * ASPHALT_DENSITY


def _optimal_tonnage(
    window_min: int,
    rate_t_per_min: float,
    road_demand_t: float,
    plant_capacity_t_per_hour: float | None,
    n_haulers: int,
    hauler_capacity_t: float,
    round_trip_min: float,
) -> tuple[float, str]:
    """4-факторный минимум: укладчик / спрос дороги / АБЗ / реальная доставка."""
    paver_t = rate_t_per_min * window_min
    demand_t = road_demand_t if road_demand_t > 0 else float("inf")
    plant_t = (
        (plant_capacity_t_per_hour or 0) * window_min / 60
        if plant_capacity_t_per_hour else float("inf")
    )
    if n_haulers > 0 and round_trip_min > 0 and hauler_capacity_t > 0:
        trips = max(1, int(window_min // round_trip_min))
        delivery_t = n_haulers * hauler_capacity_t * trips
    else:
        delivery_t = float("inf")

    candidates = [
        ("paver", paver_t),
        ("demand", demand_t),
        ("plant", plant_t),
        ("delivery", delivery_t),
    ]
    name, value = min(candidates, key=lambda x: x[1])
    return round(value, 1), name


def calculate_green_windows(
    site: Site,
    points: list[WeatherPoint],
    prep: PrepInfo | None = None,
    brigade: list[BrigadeMember] | None = None,
    plant_name: str | None = None,
    plant_capacity_t_per_hour: float | None = None,
) -> GreenWindow:
    slots: list[TimeSlot] = []
    warnings: list[str] = []
    date_str = points[0].time.strftime("%Y-%m-%d") if points else ""

    prep_total_min = prep.total_min if prep else ORDER_LEAD_TIME * 60
    prep_delta = timedelta(minutes=prep_total_min)
    rate = _tonnage_per_min(site)

    # Параметры для optimal_tonnage
    thickness_for_demand = (
        LAYER_THICKNESS_THIN if site.layer_type == "thin" else LAYER_THICKNESS_STANDARD
    )
    road_demand = site.width_m * site.length_m * thickness_for_demand * ASPHALT_DENSITY
    haulers_only = [m for m in (brigade or []) if m.type in ("dump_truck", "transfer_machine")]
    n_haulers = len(haulers_only)
    hauler_cap = (
        sum(m.capacity_t for m in haulers_only) / n_haulers
        if n_haulers else 20.0
    )
    # Один круг: фура→АБЗ→загрузка→участок→разгрузка→обратно.
    # Из prep: to_plant_min + load + delivery; обратно ≈ delivery; разгрузка 10 мин.
    if prep:
        round_trip = prep.delivery_min * 2 + prep.load_min + 10
    else:
        round_trip = (ORDER_LEAD_TIME * 60) * 0.6  # грубо

    i = 0
    while i < len(points):
        ok, _ = _is_ok(points[i], site.layer_type)
        if not ok:
            i += 1
            continue

        # начало окна
        start = points[i].time
        j = i
        all_issues: list[str] = []
        while j < len(points):
            ok, issues = _is_ok(points[j], site.layer_type)
            if not ok:
                all_issues.extend(issues)
                break
            j += 1

        end = points[j - 1].time + timedelta(hours=1)
        duration_min = int((end - start).total_seconds() / 60)
        max_t = round(rate * duration_min, 1)

        opt_t, bottleneck = _optimal_tonnage(
            window_min=duration_min,
            rate_t_per_min=rate,
            road_demand_t=road_demand,
            plant_capacity_t_per_hour=plant_capacity_t_per_hour,
            n_haulers=n_haulers,
            hauler_capacity_t=hauler_cap,
            round_trip_min=round_trip,
        )

        is_optimal = duration_min >= 120
        slots.append(
            TimeSlot(
                start=start,
                end=end,
                duration_min=duration_min,
                max_tonnage_t=max_t,
                is_optimal=is_optimal,
                yellow_start=start - prep_delta,
                rate_t_per_min=round(rate, 4),
                optimal_tonnage_t=opt_t,
                bottleneck=bottleneck,
            )
        )
        if all_issues:
            for issue in all_issues:
                if issue not in warnings:
                    warnings.append(issue)
        i = j

    # дедлайн заказа = начало первого оптимального окна - prep
    order_deadline: datetime | None = None
    for slot in slots:
        if slot.is_optimal:
            order_deadline = slot.start - prep_delta
            break

    thickness = LAYER_THICKNESS_THIN if site.layer_type == "thin" else LAYER_THICKNESS_STANDARD
    road_area = round(site.width_m * site.length_m, 1)
    road_total_t = round(road_area * thickness * ASPHALT_DENSITY, 1)

    return GreenWindow(
        site_id=site.id,
        site_name=site.name,
        date=date_str,
        slots=slots,
        order_deadline=order_deadline,
        warnings=warnings,
        prep=prep,
        brigade=brigade or [],
        plant_name=plant_name,
        road_total_t=road_total_t,
        road_area_m2=road_area,
    )
