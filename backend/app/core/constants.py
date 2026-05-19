MIN_TEMP_STANDARD = 5       # °C, нельзя укладывать ниже (обычные слои)
MIN_TEMP_THIN = 10          # °C, тонкие слои
MAX_WIND_SPEED = 5          # м/с
MIX_START_TEMP = 140        # °C, начало уплотнения
MIX_END_TEMP = 80           # °C, конец уплотнения
PAVING_SPEED_MIN = 2.0      # м/мин
PAVING_SPEED_MAX = 3.0      # м/мин
PAVING_SPEED_AVG = 2.5      # м/мин
ORDER_LEAD_TIME = 4         # часов, заказ смеси на АБЗ
MAX_PAVER_WIDTH = 7         # м
LAYER_THICKNESS_STANDARD = 0.05   # м (5 см)
LAYER_THICKNESS_THIN = 0.03       # м (3 см)
ASPHALT_DENSITY = 2.3       # т/м³

# Таблица уплотнения: {начальная_температура: {конечная_температура: время_мин}}
COMPACTION_TABLE: dict[int, dict[int, int]] = {
    150: {120: 24, 100: 40, 80: 56, 70: 63},
    145: {120: 20, 100: 36, 80: 52, 70: 60},
    140: {120: 16, 100: 32, 80: 48, 70: 56},
    135: {120: 12, 100: 28, 80: 44, 70: 52},
    120: {100: 16, 80: 32, 70: 40},
    100: {80: 16, 70: 24},
}
