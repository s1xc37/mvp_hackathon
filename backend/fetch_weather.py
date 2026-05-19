"""
Standalone-скрипт: собирает прогноз погоды со всех провайдеров для заданной точки.

Использование:
    python fetch_weather.py --lat 55.7558 --lon 37.6173
    python fetch_weather.py --lat 55.7558 --lon 37.6173 --hours 48 --out result.json
    python fetch_weather.py --lat 55.7558 --lon 37.6173 --providers openmeteo,openweather

API-ключи читаются из .env (или переменных окружения):
    OPENWEATHER_API_KEY=...
    TOMORROW_IO_API_KEY=...
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# чтобы работали импорты из app/
sys.path.insert(0, str(Path(__file__).parent))

# подтягиваем .env вручную (без pydantic-settings)
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

import httpx
from datetime import datetime, timezone

from app.providers.openmeteo import OpenMeteoProvider
from app.providers.openweather import OpenWeatherProvider
from app.providers.tomorrow_io import TomorrowIoProvider
from app.schemas.weather import WeatherPoint

ALL_PROVIDERS = ["openmeteo", "openweather", "tomorrow_io"]


def _build_providers(client: httpx.AsyncClient, enabled: list[str]):
    providers = []

    if "openmeteo" in enabled:
        providers.append(OpenMeteoProvider(client))

    if "openweather" in enabled:
        key = os.environ.get("OPENWEATHER_API_KEY", "")
        if key:
            providers.append(OpenWeatherProvider(key, client))
        else:
            print("[warn] openweather пропущен: OPENWEATHER_API_KEY не задан", file=sys.stderr)

    if "tomorrow_io" in enabled:
        key = os.environ.get("TOMORROW_IO_API_KEY", "")
        if key:
            providers.append(TomorrowIoProvider(key, client))
        else:
            print("[warn] tomorrow_io пропущен: TOMORROW_IO_API_KEY не задан", file=sys.stderr)

    return providers


def _point_to_dict(p: WeatherPoint) -> dict:
    return {
        "time": p.time.isoformat(),
        "temp_c": p.temp_c,
        "feels_like_c": p.feels_like_c,
        "wind_ms": p.wind_ms,
        "wind_gust_ms": p.wind_gust_ms,
        "precip_mm": p.precip_mm,
        "precip_probability": p.precip_probability,
        "humidity_pct": p.humidity_pct,
        "pressure_hpa": p.pressure_hpa,
        "cloudiness_pct": p.cloudiness_pct,
        "description": p.description,
        "has_precipitation": p.has_precipitation,
    }


async def fetch_all(
    lat: float,
    lon: float,
    hours: int,
    enabled: list[str],
    start_hour: int | None,
) -> list[dict]:
    now_hour = datetime.now(tz=timezone.utc).hour
    past_hours = max(0, now_hour - start_hour) if start_hour is not None else 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        providers = _build_providers(client, enabled)
        if not providers:
            print("[error] Нет доступных провайдеров", file=sys.stderr)
            return []

        tasks = [
            p.get_forecast(lat, lon, hours, past_hours=past_hours)
            if isinstance(p, OpenMeteoProvider) and past_hours > 0
            else p.get_forecast(lat, lon, hours)
            for p in providers
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for provider, result in zip(providers, results):
        if isinstance(result, Exception):
            print(f"[error] {provider.name}: {result}", file=sys.stderr)
            continue
        points = result
        if start_hour is not None:
            points = [p for p in points if p.time.hour >= start_hour]
        output.append({
            "source": provider.name,
            "points": [_point_to_dict(p) for p in points],
        })
        print(f"[ok] {provider.name}: {len(points)} точек", file=sys.stderr)

    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Сбор погоды со всех провайдеров")
    parser.add_argument("--lat", type=float, required=True, help="Широта")
    parser.add_argument("--lon", type=float, required=True, help="Долгота")
    parser.add_argument("--hours", type=int, default=24, help="Глубина прогноза в часах (по умолчанию 24)")
    parser.add_argument("--start_time", type=int, default=None, metavar="HOUR",
                        help="Начальный час суток UTC (0–23): отфильтровать точки до этого часа")
    parser.add_argument(
        "--providers",
        default=",".join(ALL_PROVIDERS),
        help=f"Провайдеры через запятую (по умолчанию: {','.join(ALL_PROVIDERS)})",
    )
    parser.add_argument("--out", default="weather_dump.json", help="Путь к выходному файлу (по умолчанию: weather_dump.json)")
    args = parser.parse_args()

    enabled = [p.strip() for p in args.providers.split(",") if p.strip()]
    unknown = set(enabled) - set(ALL_PROVIDERS)
    if unknown:
        parser.error(f"Неизвестные провайдеры: {', '.join(unknown)}. Доступны: {', '.join(ALL_PROVIDERS)}")

    if args.start_time is not None and not (0 <= args.start_time <= 23):
        parser.error("--start_time должен быть в диапазоне 0–23")

    print(f"Координаты: lat={args.lat}, lon={args.lon}, hours={args.hours}", file=sys.stderr)
    if args.start_time is not None:
        print(f"Фильтр: точки начиная с {args.start_time}:00 UTC", file=sys.stderr)
    print(f"Провайдеры: {', '.join(enabled)}", file=sys.stderr)

    data = asyncio.run(fetch_all(args.lat, args.lon, args.hours, enabled, args.start_time))

    out_path = Path(args.out)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"\nСохранено в {out_path} ({len(data)} источник(ов))", file=sys.stderr)


if __name__ == "__main__":
    main()
