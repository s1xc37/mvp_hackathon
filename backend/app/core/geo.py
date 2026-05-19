import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _lerp(p1: list[float], p2: list[float], t: float) -> list[float]:
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]


def compute_lane_polygons(polygon: list[list[float]], n_lanes: int) -> list[list[list[float]]]:
    """Split a road polygon into n_lanes sub-polygons."""
    if not polygon or n_lanes == 0:
        return []
    n = len(polygon)
    half = (n + 1) // 2
    left_start = polygon[0]
    left_end = polygon[half - 1]
    right_end = polygon[half] if half < n else polygon[-1]
    right_start = polygon[-1]

    result: list[list[list[float]]] = []
    for i in range(n_lanes):
        t1 = i / n_lanes
        t2 = (i + 1) / n_lanes
        result.append([
            _lerp(left_start, right_start, t1),
            _lerp(left_start, right_start, t2),
            _lerp(left_end, right_end, t2),
            _lerp(left_end, right_end, t1),
        ])
    return result
