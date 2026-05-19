from datetime import datetime, timezone

import httpx

from app.providers.base import WeatherProvider
from app.schemas.weather import WeatherPoint

_TIO_URL = "https://api.tomorrow.io/v4/timelines"

_WEATHER_CODES: dict[int, str] = {
    1000: "ясно",
    1001: "облачно",
    1100: "преимущественно ясно",
    1101: "переменная облачность",
    2000: "туман",
    4000: "морось",
    4001: "дождь",
    4200: "небольшой дождь",
    4201: "сильный дождь",
    5000: "снег",
    5001: "метель",
    8000: "гроза",
}


class TomorrowIoProvider(WeatherProvider):
    name = "tomorrow_io"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self._key = api_key
        self._client = client

    async def get_forecast(self, lat: float, lon: float, hours: int = 24) -> list[WeatherPoint]:
        resp = await self._client.get(
            _TIO_URL,
            params={
                "location": f"{lat},{lon}",
                "fields": "temperature,windSpeed,precipitationIntensity,humidity,weatherCode",
                "timesteps": "1h",
                "units": "metric",
                "apikey": self._key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

        points: list[WeatherPoint] = []
        intervals = data["data"]["timelines"][0]["intervals"][:hours]
        for interval in intervals:
            v = interval["values"]
            code = v.get("weatherCode", 1000)
            points.append(
                WeatherPoint(
                    time=datetime.fromisoformat(interval["startTime"].replace("Z", "+00:00")),
                    temp_c=v.get("temperature", 0.0),
                    wind_ms=v.get("windSpeed", 0.0),
                    precip_mm=v.get("precipitationIntensity", 0.0),
                    humidity_pct=v.get("humidity", 0.0),
                    description=_WEATHER_CODES.get(code, str(code)),
                )
            )
        return points
