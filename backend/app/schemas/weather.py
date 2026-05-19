from datetime import datetime
from pydantic import BaseModel


class WeatherPoint(BaseModel):
    time: datetime
    temp_c: float
    feels_like_c: float | None = None
    wind_ms: float
    wind_gust_ms: float | None = None
    precip_mm: float
    precip_probability: float | None = None
    humidity_pct: float
    pressure_hpa: float | None = None
    cloudiness_pct: int | None = None
    description: str
    has_precipitation: bool = False


class WeatherForecast(BaseModel):
    site_id: str
    lat: float
    lon: float
    fetched_at: datetime
    points: list[WeatherPoint]
    source: str
