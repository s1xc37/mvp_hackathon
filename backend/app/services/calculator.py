from app.core.constants import (
    ASPHALT_DENSITY,
    COMPACTION_TABLE,
    LAYER_THICKNESS_STANDARD,
    LAYER_THICKNESS_THIN,
    MIX_END_TEMP,
    ORDER_LEAD_TIME,
    PAVING_SPEED_AVG,
)
from app.schemas.calculator import CalcRequest, CalcResponse


def _compaction_time(mix_temp: int, target_temp: int = MIX_END_TEMP) -> int:
    temps = sorted(COMPACTION_TABLE.keys(), reverse=True)
    for t in temps:
        if mix_temp >= t:
            row = COMPACTION_TABLE[t]
            available_targets = sorted(row.keys())
            for end_t in available_targets:
                if target_temp >= end_t:
                    return row[end_t]
    # fallback — самое долгое значение
    return 56


def calculate_before_rain(req: CalcRequest) -> CalcResponse:
    compaction_min = _compaction_time(req.mix_temp_c)

    # Полезное время = время до дождя − время уплотнения последней проходки
    available_paving = req.time_to_rain_min - compaction_min
    can_start = available_paving > 0

    if not can_start:
        return CalcResponse(
            site_id=req.site_id,
            time_to_rain_min=req.time_to_rain_min,
            compaction_time_min=compaction_min,
            available_paving_min=0,
            max_tonnage_t=0.0,
            trucks_needed=0,
            recommendation="Нет времени — уплотнение займёт дольше, чем осталось до дождя. Укладку начинать не рекомендуется.",
            can_start=False,
        )

    thickness = LAYER_THICKNESS_THIN if req.layer_type == "thin" else LAYER_THICKNESS_STANDARD
    rate_t_per_min = req.paver_width_m * PAVING_SPEED_AVG * thickness * ASPHALT_DENSITY
    max_tonnage = round(rate_t_per_min * available_paving, 1)

    # 1 самосвал = ~20 т, ехать с АБЗ ~ ORDER_LEAD_TIME*60 мин
    truck_capacity = 20.0
    trucks_needed = max(1, int(max_tonnage / truck_capacity + 0.99))

    if req.time_to_rain_min < ORDER_LEAD_TIME * 60:
        recommendation = (
            f"Заказать смесь немедленно! Дождь через {req.time_to_rain_min} мин. "
            f"Можно уложить до {max_tonnage} т ({trucks_needed} самосвал(а)). "
            f"Время уплотнения: {compaction_min} мин."
        )
    else:
        recommendation = (
            f"Укладка возможна. Максимальный тоннаж: {max_tonnage} т, "
            f"потребуется {trucks_needed} самосвал(а). "
            f"Уплотнение займёт {compaction_min} мин — завершить до дождя."
        )

    return CalcResponse(
        site_id=req.site_id,
        time_to_rain_min=req.time_to_rain_min,
        compaction_time_min=compaction_min,
        available_paving_min=available_paving,
        max_tonnage_t=max_tonnage,
        trucks_needed=trucks_needed,
        recommendation=recommendation,
        can_start=True,
    )
