import asyncio
import logging
from datetime import datetime, timezone

from app.core.constants import MAX_WIND_SPEED, MIN_TEMP_STANDARD, MIN_TEMP_THIN

import httpx

from app.config import settings
from app.providers.base import WeatherProvider
from app.providers.mock import MockWeatherProvider
from app.providers.openmeteo import OpenMeteoProvider
from app.providers.openweather import OpenWeatherProvider
from app.providers.tomorrow_io import TomorrowIoProvider
from app.schemas.weather import WeatherForecast, WeatherPoint

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, WeatherForecast]] = {}
_CACHE_TTL = 600  # 10 минут


def _cache_key(lat: float, lon: float) -> str:
    return f"{lat:.3f},{lon:.3f}"


def _now_ts() -> float:
    return datetime.now(tz=timezone.utc).timestamp()


def _blend_points(forecasts: list[list[WeatherPoint]]) -> list[WeatherPoint]:
    if not forecasts:
        return []
    min_len = min(len(f) for f in forecasts)
    blended: list[WeatherPoint] = []
    for i in range(min_len):
        pts = [f[i] for f in forecasts]
        # осадки: если хоть один провайдер говорит "да" — считаем да
        has_precip = any(p.has_precipitation for p in pts)
        precip_mm = max(p.precip_mm for p in pts)
        blended.append(
            WeatherPoint(
                time=pts[0].time,
                temp_c=round(sum(p.temp_c for p in pts) / len(pts), 1),
                feels_like_c=round(sum(p.feels_like_c or p.temp_c for p in pts) / len(pts), 1),
                wind_ms=round(sum(p.wind_ms for p in pts) / len(pts), 1),
                wind_gust_ms=round(max((p.wind_gust_ms or p.wind_ms) for p in pts), 1),
                precip_mm=round(precip_mm, 2),
                precip_probability=round(
                    sum(p.precip_probability or 0 for p in pts) / len(pts), 1
                ) or None,
                humidity_pct=round(sum(p.humidity_pct for p in pts) / len(pts), 1),
                pressure_hpa=round(
                    sum(p.pressure_hpa or 1013 for p in pts) / len(pts), 1
                ),
                cloudiness_pct=round(
                    sum(p.cloudiness_pct or 0 for p in pts) / len(pts)
                ),
                description=pts[0].description,
                has_precipitation=has_precip,
            )
        )
    return blended


def _build_providers(client: httpx.AsyncClient) -> list[WeatherProvider]:
    # Только Open-Meteo — остальные провайдеры сохранены, но временно отключены
    return [OpenMeteoProvider(client)]


async def get_forecast(
    site_id: str, lat: float, lon: float, client: httpx.AsyncClient, hours: int = 24
) -> WeatherForecast:
    key = _cache_key(lat, lon)
    ts = _now_ts()
    if key in _CACHE and ts - _CACHE[key][0] < _CACHE_TTL:
        return _CACHE[key][1]

    providers = _build_providers(client)
    tasks = [p.get_forecast(lat, lon, hours) for p in providers]

    results: list[list[WeatherPoint]] = []
    source_names: list[str] = []
    for provider, result in zip(providers, await asyncio.gather(*tasks, return_exceptions=True)):
        if isinstance(result, Exception):
            logger.warning("Провайдер %s вернул ошибку: %s", provider.name, result)
        else:
            results.append(result)
            source_names.append(provider.name)

    if not results:
        logger.warning("Все провайдеры недоступны, используем mock")
        results = [await MockWeatherProvider().get_forecast(lat, lon, hours)]
        source_names = ["mock"]

    points = _blend_points(results) if len(results) > 1 else results[0]
    forecast = WeatherForecast(
        site_id=site_id,
        lat=lat,
        lon=lon,
        fetched_at=datetime.now(tz=timezone.utc),
        points=points,
        source="+".join(source_names),
    )
    _CACHE[key] = (ts, forecast)
    return forecast


def is_weather_suitable(points: list[WeatherPoint], layer_type: str = "standard") -> bool:
    """True если ближайшие 4 точки (часа) подходят для укладки."""
    if not points:
        return False
    min_temp = MIN_TEMP_THIN if layer_type == "thin" else MIN_TEMP_STANDARD
    check = points[:4]
    return all(
        p.temp_c >= min_temp and p.wind_ms <= MAX_WIND_SPEED and not p.has_precipitation
        for p in check
    )


def weather_windows_human(points: list[WeatherPoint], layer_type: str = "standard") -> list[str]:
    """Return list of human-readable windows like ['20:00–05:00'] in Moscow time (UTC+3)."""
    from datetime import timedelta
    MOSCOW = timezone(timedelta(hours=3))
    min_temp = MIN_TEMP_THIN if layer_type == "thin" else MIN_TEMP_STANDARD
    windows: list[str] = []
    i = 0
    while i < len(points):
        p = points[i]
        if p.temp_c >= min_temp and p.wind_ms <= MAX_WIND_SPEED and not p.has_precipitation:
            start = p.time
            j = i
            while j < len(points):
                q = points[j]
                if not (q.temp_c >= min_temp and q.wind_ms <= MAX_WIND_SPEED and not q.has_precipitation):
                    break
                j += 1
            end = points[j - 1].time + timedelta(hours=1)
            windows.append(
                f"{start.astimezone(MOSCOW).strftime('%H:%M')}–{end.astimezone(MOSCOW).strftime('%H:%M')}"
            )
            i = j
        else:
            i += 1
    return windows


def weather_note(points: list[WeatherPoint], layer_type: str = "standard") -> str:
    if not points:
        return "Нет данных о погоде"
    p = points[0]
    suitable = is_weather_suitable(points, layer_type)
    if suitable:
        return f"Температура {p.temp_c:.0f}°C, ветер {p.wind_ms:.0f} м/с — укладка возможна"
    reasons = []
    min_temp = MIN_TEMP_THIN if layer_type == "thin" else MIN_TEMP_STANDARD
    if p.temp_c < min_temp:
        reasons.append(f"температура {p.temp_c:.0f}°C ниже минимума {min_temp}°C")
    if p.wind_ms > MAX_WIND_SPEED:
        reasons.append(f"ветер {p.wind_ms:.0f} м/с превышает норму")
    if any(q.has_precipitation for q in points[:4]):
        reasons.append("ожидаются осадки")
    return "Укладка не рекомендована: " + ", ".join(reasons)
