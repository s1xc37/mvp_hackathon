import math

THICKNESS_M = 0.06
DENSITY_T_M3 = 2.4
LANE_WIDTH_M = 3.75
PaverSpeed_m_min = 12
TRUCK_SPEED_WITH_LOAD = 60

HEATED_TRUCK_COOLING_RATE = {
    10: 0.35,
    5: 0.36,
    0: 0.37,
    -5: 0.38,
    -10: 0.40
}

COMPACTION_TABLE = {
    150: 24,
    145: 20,
    140: 16,
    135: 12
}


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def get_cooling_rate_truck(Temp_air):
    if Temp_air >= 10:
        return 0.35
    elif Temp_air >= 5:
        return 0.36
    elif Temp_air >= 0:
        return 0.37
    elif Temp_air >= -5:
        return 0.38
    elif Temp_air >= -10:
        return 0.40
    else:
        return 0.45


def get_cooling_rate_waiting(Temp_air, Wind):
    cooling_rate = 0.2 + (Wind * 0.05) + (20 - Temp_air) * 0.02
    if cooling_rate < 0.15:
        cooling_rate = 0.15
    return cooling_rate


def get_compaction_time(AsphaltTemp):
    if AsphaltTemp >= 150:
        return 24
    elif AsphaltTemp >= 145:
        return 20
    elif AsphaltTemp >= 140:
        return 16
    elif AsphaltTemp >= 135:
        return 12
    else:
        return 0


def check_green_window(Temp, Wind, Rain_mm_per_hour, AsphaltTemp):
    if AsphaltTemp < 140:
        return False, f"Асфальт остыл: {AsphaltTemp}°C < 140°C"
    if Temp < -10:
        return False, f"Слишком холодно: {Temp}°C < -10°C"
    if Wind > 5:
        return False, f"Сильный ветер: {Wind} м/с > 5 м/с"
    if Rain_mm_per_hour > 5:
        return False, f"Осадки: {Rain_mm_per_hour} мм/ч > 5 мм/ч"
    return True, "Погода подходит"


def calc_drying_time(Rain_mm_per_day, Temp_air):
    if Rain_mm_per_day == 0:
        return 0
    if Rain_mm_per_day <= 2:
        return 30
    if Rain_mm_per_day <= 5:
        return 60
    return 120


def calc_truck_time_from_coords(plant_lat, plant_lon, stage_lat, stage_lon):
    distance_km = haversine_distance(plant_lat, plant_lon, stage_lat, stage_lon)
    time_hours = distance_km / TRUCK_SPEED_WITH_LOAD
    time_minutes = time_hours * 60
    return {
        'distance_km': distance_km,
        'time_hours': time_hours,
        'time_minutes': time_minutes
    }


def calc_heat_loss_truck(AsphaltTemp_start, TruckTime_min, Temp_air):
    cooling_rate = get_cooling_rate_truck(Temp_air)
    Temp_loss = cooling_rate * TruckTime_min
    AsphaltTemp_end = AsphaltTemp_start - Temp_loss
    return {
        'cooling_rate': cooling_rate,
        'temp_loss': Temp_loss,
        'temp_end': max(AsphaltTemp_end, 80)
    }


def calc_heat_loss_waiting(AsphaltTemp_start, WaitTime_min, Temp_air, Wind):
    cooling_rate = get_cooling_rate_waiting(Temp_air, Wind)
    Temp_loss = cooling_rate * WaitTime_min
    AsphaltTemp_end = AsphaltTemp_start - Temp_loss
    return {
        'cooling_rate': cooling_rate,
        'temp_loss': Temp_loss,
        'temp_end': max(AsphaltTemp_end, 80)
    }


def calc_compaction_speed(AsphaltTemp, RequiredCompactionTime_min, PavWidth_m):
    CompactionTime_min = get_compaction_time(AsphaltTemp)
    if CompactionTime_min == 0:
        return {
            'error': True,
            'message': f"Температура {AsphaltTemp}°C ниже порога уплотнения (135°C)"
        }
    if CompactionTime_min > RequiredCompactionTime_min:
        return {
            'error': True,
            'message': f"Требуется {CompactionTime_min} мин на уплотнение, но до дождя осталось {RequiredCompactionTime_min} мин"
        }
    RollerSpeed_kmh = 2.5
    RollerSpeed_ms = RollerSpeed_kmh * 1000 / 60
    Passes = 10
    Overlap = 0.15
    RollerWidth_m = 2.0
    EffectiveWidth_m = RollerWidth_m - Overlap
    Passes_needed = math.ceil(PavWidth_m / EffectiveWidth_m) * Passes
    Time_per_pass_min = (PavWidth_m / RollerSpeed_ms) / 60
    TotalRollerTime_min = Time_per_pass_min * Passes_needed
    return {
        'error': False,
        'CompactionTime_min': CompactionTime_min,
        'TotalRollerTime_min': TotalRollerTime_min,
        'RollerSpeed_kmh': RollerSpeed_kmh,
        'Passes_needed': Passes_needed
    }


def main():
    print("=" * 60)
    print("РАСЧЁТ ПО ВРЕМЕНИ - СКОЛЬКО УЛОЖИМ АСФАЛЬТА")
    print("=" * 60)
    print("\nТЕХНИКА: Самосвал с подогревом кузова и тентом")
    print("ДОПУСКИ: Осадки до 5 мм/ч, температура до -10°C")

    print("\n1. КООРДИНАТЫ ЗАВОДА И УЧАСТКА:")
    plant_lat = float(input("   Широта завода (градусы): "))
    plant_lon = float(input("   Долгота завода (градусы): "))
    stage_lat = float(input("   Широта участка (градусы): "))
    stage_lon = float(input("   Долгота участка (градусы): "))

    truck_time = calc_truck_time_from_coords(plant_lat, plant_lon, stage_lat, stage_lon)
    print(f"\n   Расстояние: {truck_time['distance_km']:.1f} км")
    print(f"   Время в пути: {truck_time['time_minutes']:.0f} мин")

    print("\n2. ПОГОДНЫЕ УСЛОВИЯ:")
    Temp = float(input("   Температура воздуха (°C): "))
    Wind = float(input("   Скорость ветра (м/с): "))
    Rain_mm_per_hour = float(input("   Осадки сейчас (мм/ч, макс 5): "))
    Rain_mm_per_day = float(input("   Осадки за сутки (мм/сут): "))

    print("\n3. ТЕМПЕРАТУРА АСФАЛЬТА:")
    AsphaltTemp_start = float(input("   Температура при погрузке (°C, норма 150-170): "))

    print("\n4. ПАРАМЕТРЫ УКЛАДКИ:")
    LanesQty = int(input("   Количество полос (шт): "))
    TimeBeforeRain_min = float(input("   Время до начала осадков (мин): "))
    SafeTime_min = float(input("   Запас времени на сворачивание (мин): "))
    WaitTime_min = float(input("   Время ожидания перед укладкой (мин): "))

    PavWidth_m = LanesQty * LANE_WIDTH_M

    print("\n" + "=" * 60)
    print("РАСЧЁТ ПОТЕРЬ ТЕПЛА")
    print("=" * 60)

    heat_loss_truck = calc_heat_loss_truck(AsphaltTemp_start, truck_time['time_minutes'], Temp)
    print(f"\n--- ТРАНСПОРТИРОВКА ---")
    print(f"   Потеря температуры: {heat_loss_truck['temp_loss']:.1f}°C")
    print(f"   Температура при выгрузке: {heat_loss_truck['temp_end']:.0f}°C")

    heat_loss_waiting = calc_heat_loss_waiting(heat_loss_truck['temp_end'], WaitTime_min, Temp, Wind)
    print(f"\n--- ОЖИДАНИЕ ---")
    print(f"   Потеря температуры: {heat_loss_waiting['temp_loss']:.1f}°C")
    print(f"   Температура перед укладкой: {heat_loss_waiting['temp_end']:.0f}°C")

    AsphaltTemp_before_paving = heat_loss_waiting['temp_end']

    IsGreen, Reason = check_green_window(Temp, Wind, Rain_mm_per_hour, AsphaltTemp_before_paving)
    print(f"\n   Результат: {'МОЖНО РАБОТАТЬ' if IsGreen else 'НЕЛЬЗЯ РАБОТАТЬ - ' + Reason}")

    if not IsGreen:
        return

    DryingTime_min = calc_drying_time(Rain_mm_per_day, Temp)
    if DryingTime_min > 0:
        print(f"\n   ВНИМАНИЕ: Требуется просушка участка {DryingTime_min} мин")

    CompactionCheck = calc_compaction_speed(AsphaltTemp_before_paving, TimeBeforeRain_min - SafeTime_min, PavWidth_m)
    if CompactionCheck['error']:
        print(f"\n   ОШИБКА: {CompactionCheck['message']}")
        return

    TotalPrepTime_min = DryingTime_min + 15 + CompactionCheck['TotalRollerTime_min']
    WorkTime_min = max(0, TimeBeforeRain_min - TotalPrepTime_min - SafeTime_min)
    LengthM = WorkTime_min * PaverSpeed_m_min
    LengthKm = LengthM / 1000
    Volume = LengthM * PavWidth_m * THICKNESS_M
    WeightT = Volume * DENSITY_T_M3

    print("\n" + "=" * 60)
    print("РЕЗУЛЬТАТ РАСЧЁТА")
    print("=" * 60)
    print(f"\n   Время на просушку: {DryingTime_min} мин")
    print(f"   Время на уплотнение катками: {CompactionCheck['TotalRollerTime_min']:.0f} мин")
    print(f"   Реальное время укладки: {WorkTime_min:.0f} мин")
    print(f"   Длина укладки: {LengthM:.1f} м ({LengthKm:.3f} км)")
    print(f"   Объём асфальта: {Volume:.1f} м³")
    print(f"   Масса асфальта: {WeightT:.1f} тонн")

    print("\n" + "=" * 60)
    print("РАСЧЁТ ЗАВЕРШЁН")


if __name__ == "__main__":
    main()