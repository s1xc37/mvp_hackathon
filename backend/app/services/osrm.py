import httpx

from app.core.geo import haversine_km

_OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


async def fetch_route(
    client: httpx.AsyncClient,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict:
    """Возвращает маршрут OSRM или прямую линию, если OSRM недоступен.

    Формат ответа:
        {
            "route": [[lat, lon], ...],
            "distance_km": float,
            "duration_min": float,
            "source": "osrm" | "fallback",
        }
    """
    url = f"{_OSRM_URL}/{start_lon},{start_lat};{end_lon},{end_lat}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}

    try:
        resp = await client.get(url, params=params, timeout=10.0)
        data = resp.json()
        if data.get("code") == "Ok" and data.get("routes"):
            route = data["routes"][0]
            coords = route["geometry"]["coordinates"]  # [[lon, lat], ...]
            return {
                "route": [[c[1], c[0]] for c in coords],
                "distance_km": round(route["distance"] / 1000, 2),
                "duration_min": round(route["duration"] / 60, 1),
                "source": "osrm",
            }
    except (httpx.HTTPError, ValueError, KeyError):
        pass

    # Fallback — прямая линия, время по haversine + 60 км/ч
    dist = haversine_km(start_lat, start_lon, end_lat, end_lon)
    return {
        "route": [[start_lat, start_lon], [end_lat, end_lon]],
        "distance_km": round(dist, 2),
        "duration_min": round(dist / 60 * 60, 1),
        "source": "fallback",
    }
