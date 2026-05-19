from datetime import datetime, timezone

import httpx

from app.providers.base import WeatherProvider
from app.schemas.weather import WeatherPoint

_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes → (есть осадки, описание)
_WMO: dict[int, tuple[bool, str]] = {
    0:  (False, "Ясно"),
    1:  (False, "Преимущественно ясно"),
    2:  (False, "Переменная облачность"),
    3:  (False, "Пасмурно"),
    45: (False, "Туман"),
    48: (False, "Изморозь"),
    51: (True,  "Лёгкая морось"),
    53: (True,  "Умеренная морось"),
    55: (True,  "Сильная морось"),
    56: (True,  "Лёгкая ледяная морось"),
    57: (True,  "Сильная ледяная морось"),
    61: (True,  "Небольшой дождь"),
    63: (True,  "Умеренный дождь"),
    65: (True,  "Сильный дождь"),
    66: (True,  "Лёгкий ледяной дождь"),
    67: (True,  "Сильный ледяной дождь"),
    71: (True,  "Небольшой снег"),
    73: (True,  "Умеренный снег"),
    75: (True,  "Сильный снег"),
    77: (True,  "Снежные зёрна"),
    80: (True,  "Небольшой ливень"),
    81: (True,  "Умеренный ливень"),
    82: (True,  "Сильный ливень"),
    85: (True,  "Небольшой снегопад"),
    86: (True,  "Сильный снегопад"),
    95: (True,  "Гроза"),
    96: (True,  "Гроза с градом"),
    99: (True,  "Сильная гроза с градом"),
}


class OpenMeteoProvider(WeatherProvider):
    """Бесплатный API без ключа. Почасовые данные, вся Европа."""

    name = "openmeteo"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get_forecast(self, lat: float, lon: float, hours: int = 24, past_hours: int = 0) -> list[WeatherPoint]:
        params: dict = {
            "latitude": lat,
            "longitude": lon,
            "hourly": [
                "temperature_2m",
                "apparent_temperature",
                "precipitation_probability",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
                "wind_gusts_10m",
                "relative_humidity_2m",
                "pressure_msl",
                "cloud_cover",
            ],
            "timezone": "UTC",
            "forecast_hours": hours,
        }
        if past_hours > 0:
            params["past_hours"] = past_hours
        resp = await self._client.get(_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
        return self._parse(data, past_hours + hours)

    def _parse(self, data: dict, hours: int) -> list[WeatherPoint]:
        h = data.get("hourly", {})
        times = h.get("time", [])
        temps = h.get("temperature_2m", [])
        feels = h.get("apparent_temperature", [])
        precip_prob = h.get("precipitation_probability", [])
        precip = h.get("precipitation", [])
        codes = h.get("weather_code", [])
        winds = h.get("wind_speed_10m", [])
        gusts = h.get("wind_gusts_10m", [])
        humidity = h.get("relative_humidity_2m", [])
        pressure = h.get("pressure_msl", [])
        cloud = h.get("cloud_cover", [])

        points: list[WeatherPoint] = []
        for i in range(min(hours, len(times))):
            code = int(codes[i]) if i < len(codes) and codes[i] is not None else 0
            has_precip, desc = _WMO.get(code, (False, "Нет данных"))
            # Open-Meteo отдаёт время без tzinfo (local), конвертируем в UTC-aware
            t = datetime.fromisoformat(times[i]).replace(tzinfo=timezone.utc)
            points.append(
                WeatherPoint(
                    time=t,
                    temp_c=float(temps[i]) if i < len(temps) and temps[i] is not None else 0.0,
                    feels_like_c=float(feels[i]) if i < len(feels) and feels[i] is not None else None,
                    wind_ms=float(winds[i]) if i < len(winds) and winds[i] is not None else 0.0,
                    wind_gust_ms=float(gusts[i]) if i < len(gusts) and gusts[i] is not None else None,
                    precip_mm=float(precip[i]) if i < len(precip) and precip[i] is not None else 0.0,
                    precip_probability=float(precip_prob[i]) if i < len(precip_prob) and precip_prob[i] is not None else None,
                    humidity_pct=float(humidity[i]) if i < len(humidity) and humidity[i] is not None else 0.0,
                    pressure_hpa=float(pressure[i]) if i < len(pressure) and pressure[i] is not None else None,
                    cloudiness_pct=int(cloud[i]) if i < len(cloud) and cloud[i] is not None else None,
                    description=desc,
                    has_precipitation=has_precip,
                )
            )
        return points
