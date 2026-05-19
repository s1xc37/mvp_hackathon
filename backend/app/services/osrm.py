"""Маршрутизация через публичный OSRM (router.project-osrm.org).

Поддерживает Route API (один маршрут A→B) и Table API (матрица длительностей).
Простой in-memory кэш с TTL 1 час — координаты заводов и парковок стабильны
за сессию, а пересчёты окон могут дёргать одни и те же пары многократно.
"""
import time

import httpx

from app.core.geo import haversine_km

_OSRM_BASE = "https://router.project-osrm.org"
_OSRM_ROUTE = f"{_OSRM_BASE}/route/v1/driving"
_OSRM_TABLE = f"{_OSRM_BASE}/table/v1/driving"

# Простой кэш: ключ → (timestamp, value)
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 3600.0  # 1 час


def _now() -> float:
    return time.monotonic()


def _cache_get(key: str) -> dict | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    ts, val = hit
    if _now() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_set(key: str, value: dict) -> None:
    _CACHE[key] = (_now(), value)


async def fetch_route(
    client: httpx.AsyncClient,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict:
    """Маршрут A→B. Возвращает {route, distance_km, duration_min, source}.

    Fallback — прямая линия + haversine, время по 60 км/ч.
    """
    key = f"route|{start_lat:.5f},{start_lon:.5f}|{end_lat:.5f},{end_lon:.5f}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    url = f"{_OSRM_ROUTE}/{start_lon},{start_lat};{end_lon},{end_lat}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}

    try:
        resp = await client.get(url, params=params, timeout=10.0)
        data = resp.json()
        if data.get("code") == "Ok" and data.get("routes"):
            route = data["routes"][0]
            coords = route["geometry"]["coordinates"]
            out = {
                "route": [[c[1], c[0]] for c in coords],
                "distance_km": round(route["distance"] / 1000, 2),
                "duration_min": round(route["duration"] / 60, 1),
                "source": "osrm",
            }
            _cache_set(key, out)
            return out
    except (httpx.HTTPError, ValueError, KeyError):
        pass

    dist = haversine_km(start_lat, start_lon, end_lat, end_lon)
    out = {
        "route": [[start_lat, start_lon], [end_lat, end_lon]],
        "distance_km": round(dist, 2),
        "duration_min": round(dist / 60 * 60, 1),
        "source": "fallback",
    }
    _cache_set(key, out)
    return out


async def fetch_table(
    client: httpx.AsyncClient,
    sources: list[tuple[float, float]],
    destinations: list[tuple[float, float]],
) -> dict:
    """Матрица duration/distance: len(sources) × len(destinations).

    Возвращает {durations_min: list[list[float]], distances_km: list[list[float]], source}.
    При недоступности OSRM — fallback через haversine.
    """
    if not sources or not destinations:
        return {"durations_min": [], "distances_km": [], "source": "fallback"}

    src_key = ";".join(f"{lat:.5f},{lon:.5f}" for lat, lon in sources)
    dst_key = ";".join(f"{lat:.5f},{lon:.5f}" for lat, lon in destinations)
    key = f"table|{src_key}|{dst_key}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    all_pts = list(sources) + list(destinations)
    coords = ";".join(f"{lon},{lat}" for lat, lon in all_pts)
    src_idx = ";".join(str(i) for i in range(len(sources)))
    dst_idx = ";".join(str(i + len(sources)) for i in range(len(destinations)))
    url = f"{_OSRM_TABLE}/{coords}"
    params = {
        "sources": src_idx,
        "destinations": dst_idx,
        "annotations": "duration,distance",
    }

    try:
        resp = await client.get(url, params=params, timeout=12.0)
        data = resp.json()
        if data.get("code") == "Ok":
            durs = data.get("durations") or []
            dists = data.get("distances") or []
            out = {
                "durations_min": [[round((c or 0) / 60, 1) for c in row] for row in durs],
                "distances_km": [[round((c or 0) / 1000, 2) for c in row] for row in dists],
                "source": "osrm",
            }
            _cache_set(key, out)
            return out
    except (httpx.HTTPError, ValueError, KeyError):
        pass

    # Fallback: матрица haversine
    durations: list[list[float]] = []
    distances: list[list[float]] = []
    for slat, slon in sources:
        row_d: list[float] = []
        row_km: list[float] = []
        for dlat, dlon in destinations:
            km = haversine_km(slat, slon, dlat, dlon)
            row_km.append(round(km, 2))
            row_d.append(round(km / 60 * 60, 1))  # 60 км/ч
        durations.append(row_d)
        distances.append(row_km)
    out = {
        "durations_min": durations,
        "distances_km": distances,
        "source": "fallback",
    }
    _cache_set(key, out)
    return out
