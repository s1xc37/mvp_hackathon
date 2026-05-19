import asyncio
from datetime import datetime, timezone

import httpx

from app.providers.base import WeatherProvider
from app.schemas.weather import WeatherPoint

_CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather"
_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"

# id погоды → есть ли осадки
def _has_precip(weather_id: int) -> bool:
    return 200 <= weather_id < 700


class OpenWeatherProvider(WeatherProvider):
    name = "openweather"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self._key = api_key
        self._client = client

    async def get_forecast(self, lat: float, lon: float, hours: int = 24) -> list[WeatherPoint]:
        params = {"lat": lat, "lon": lon, "appid": self._key, "units": "metric", "lang": "ru"}

        # параллельно тянем текущую погоду и прогноз
        current_task = self._client.get(_CURRENT_URL, params=params)
        forecast_task = self._client.get(_FORECAST_URL, params={**params, "cnt": max(8, hours // 3)})
        current_resp, forecast_resp = await asyncio.gather(current_task, forecast_task)
        current_resp.raise_for_status()
        forecast_resp.raise_for_status()

        current = current_resp.json()
        forecast_list = forecast_resp.json().get("list", [])

        points: list[WeatherPoint] = []

        # текущая точка
        points.append(self._parse_current(current))

        # прогноз
        for item in forecast_list[: hours - 1]:
            points.append(self._parse_forecast_item(item))

        return points

    def _parse_current(self, d: dict) -> WeatherPoint:
        main = d.get("main", {})
        wind = d.get("wind", {})
        weather = d.get("weather", [{}])[0]
        rain = d.get("rain", {})
        snow = d.get("snow", {})
        precip_mm = rain.get("1h", rain.get("3h", 0.0)) + snow.get("1h", snow.get("3h", 0.0))
        wid = weather.get("id", 800)
        return WeatherPoint(
            time=datetime.fromtimestamp(d.get("dt", 0), tz=timezone.utc),
            temp_c=float(main.get("temp", 0)),
            feels_like_c=float(main.get("feels_like", 0)) or None,
            wind_ms=float(wind.get("speed", 0)),
            wind_gust_ms=float(wind.get("gust", 0)) or None,
            precip_mm=precip_mm,
            humidity_pct=float(main.get("humidity", 0)),
            pressure_hpa=float(main.get("pressure", 0)) or None,
            cloudiness_pct=d.get("clouds", {}).get("all"),
            description=weather.get("description", "").capitalize(),
            has_precipitation=_has_precip(wid),
        )

    def _parse_forecast_item(self, item: dict) -> WeatherPoint:
        main = item.get("main", {})
        wind = item.get("wind", {})
        weather = item.get("weather", [{}])[0]
        rain = item.get("rain", {})
        snow = item.get("snow", {})
        precip_mm = rain.get("3h", 0.0) + snow.get("3h", 0.0)
        wid = weather.get("id", 800)
        pop = item.get("pop", 0.0)
        return WeatherPoint(
            time=datetime.fromtimestamp(item.get("dt", 0), tz=timezone.utc),
            temp_c=float(main.get("temp", 0)),
            feels_like_c=float(main.get("feels_like", 0)) or None,
            wind_ms=float(wind.get("speed", 0)),
            wind_gust_ms=float(wind.get("gust", 0)) or None,
            precip_mm=precip_mm,
            precip_probability=float(pop * 100) if pop else None,
            humidity_pct=float(main.get("humidity", 0)),
            pressure_hpa=float(main.get("pressure", 0)) or None,
            cloudiness_pct=item.get("clouds", {}).get("all"),
            description=weather.get("description", "").capitalize(),
            has_precipitation=_has_precip(wid),
        )
