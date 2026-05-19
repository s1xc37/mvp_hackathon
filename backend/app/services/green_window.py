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


def calculate_green_windows(
    site: Site,
    points: list[WeatherPoint],
    prep: PrepInfo | None = None,
    brigade: list[BrigadeMember] | None = None,
    plant_name: str | None = None,
) -> GreenWindow:
    slots: list[TimeSlot] = []
    warnings: list[str] = []
    date_str = points[0].time.strftime("%Y-%m-%d") if points else ""

    prep_total_min = prep.total_min if prep else ORDER_LEAD_TIME * 60
    prep_delta = timedelta(minutes=prep_total_min)
    rate = _tonnage_per_min(site)

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

        # окно оптимально, если ≥ 2 часа
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
