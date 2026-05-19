import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.data_utils import get_site_by_id
from app.core.deps import get_http_client
from app.schemas.site import Site
from app.schemas.weather import WeatherForecast
from app.services import weather_aggregator

router = APIRouter(prefix="/api/weather", tags=["weather"])


def _get_site(site_id: str) -> Site:
    site = get_site_by_id(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    return site


@router.get("/point", response_model=WeatherForecast)
async def get_weather_by_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=1, le=168),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> WeatherForecast:
    site_id = f"{lat:.4f},{lon:.4f}"
    return await weather_aggregator.get_forecast(site_id, lat, lon, client, hours)


@router.get("/{site_id}", response_model=WeatherForecast)
async def get_weather(
    site_id: str,
    hours: int = 24,
    client: httpx.AsyncClient = Depends(get_http_client),
) -> WeatherForecast:
    site = _get_site(site_id)
    return await weather_aggregator.get_forecast(site.id, site.lat, site.lon, client, hours)
