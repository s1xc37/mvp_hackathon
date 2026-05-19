import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.data_utils import get_site_by_id, load_sites
from app.core.deps import get_http_client
from app.core.geo import compute_lane_polygons
from app.schemas.lane import LanePolygon
from app.schemas.site import Site
from app.services import weather_aggregator

router = APIRouter(prefix="/api/roads", tags=["roads"])


async def _build_site(site: Site, client: httpx.AsyncClient) -> Site:
    polys = compute_lane_polygons(site.polygon, len(site.lanes))
    lane_polys = [
        LanePolygon(lane_id=site.lanes[i].id, polygon=polys[i])
        for i in range(len(polys))
    ]
    forecast = await weather_aggregator.get_forecast(site.id, site.lat, site.lon, client, 24)
    ws = weather_aggregator.is_weather_suitable(forecast.points, site.layer_type)
    note = weather_aggregator.weather_note(forecast.points, site.layer_type)
    windows = weather_aggregator.weather_windows_human(forecast.points, site.layer_type)
    return site.model_copy(update={
        "lane_polygons": lane_polys,
        "weather_suitable": ws,
        "weather_note": note,
        "weather_windows": windows,
    })


@router.get("", response_model=list[Site])
async def list_roads(client: httpx.AsyncClient = Depends(get_http_client)) -> list[Site]:
    return [await _build_site(s, client) for s in load_sites()]


@router.get("/{road_id}", response_model=Site)
async def get_road(road_id: str, client: httpx.AsyncClient = Depends(get_http_client)) -> Site:
    site = get_site_by_id(road_id)
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    return await _build_site(site, client)
