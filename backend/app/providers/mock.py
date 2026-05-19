import math
import random
from datetime import datetime, timedelta, timezone

from app.providers.base import WeatherProvider
from app.schemas.weather import WeatherPoint

_CONDITIONS = [
    "ясно",
    "переменная облачность",
    "облачно",
    "небольшой дождь",
    "дождь",
]


class MockWeatherProvider(WeatherProvider):
    name = "mock"

    async def get_forecast(self, lat: float, lon: float, hours: int = 24) -> list[WeatherPoint]:
        rng = random.Random(int(lat * 1000 + lon * 100))
        now = datetime.now(tz=timezone.utc).replace(minute=0, second=0, microsecond=0)

        base_temp = 14.0 + rng.uniform(-3, 3)
        points: list[WeatherPoint] = []

        for i in range(hours):
            t = now + timedelta(hours=i)
            # суточный ход температуры
            temp = base_temp + 5 * math.sin((i - 6) * math.pi / 12) + rng.gauss(0, 0.5)
            wind = max(0.0, rng.gauss(3.5, 1.5))
            # дождь с вероятностью ~20%, обычно во 2й половине дня
            rain_prob = 0.20 + 0.10 * math.sin((i - 14) * math.pi / 12)
            precip = rng.uniform(0.5, 3.0) if rng.random() < rain_prob else 0.0
            desc = "небольшой дождь" if 0 < precip < 1 else ("дождь" if precip >= 1 else rng.choice(_CONDITIONS[:3]))
            points.append(
                WeatherPoint(
                    time=t,
                    temp_c=round(temp, 1),
                    wind_ms=round(wind, 1),
                    precip_mm=round(precip, 2),
                    humidity_pct=round(rng.uniform(55, 85), 1),
                    description=desc,
                )
            )
        return points
