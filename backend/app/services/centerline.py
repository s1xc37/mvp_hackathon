"""Извлечение осевой линии из полигона дороги.

Дорога в БД хранится как полигон (контур). Для анимации укладчика нужна линия,
по которой он движется. Берём самую длинную пару точек полигона как ось,
затем по этой оси семплируем равномерные точки.
"""
from __future__ import annotations

import math


Coord = list[float]  # [lat, lon]


def _haversine_m(a: Coord, b: Coord) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(h))


def _interpolate(a: Coord, b: Coord, t: float) -> Coord:
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]


def compute_centerline(polygon: list[Coord], samples: int = 20) -> tuple[list[Coord], float]:
    """Возвращает (точки_осевой, общая_длина_м).

    Полигон — массив [[lat, lon], ...]. Если в нём <2 точек — пустой список.
    """
    if not polygon or len(polygon) < 2:
        return [], 0.0

    # Находим самую длинную диагональ полигона — она же ось дороги.
    best_a, best_b, best_d = polygon[0], polygon[1], 0.0
    for i, p in enumerate(polygon):
        for q in polygon[i + 1:]:
            d = _haversine_m(p, q)
            if d > best_d:
                best_a, best_b, best_d = p, q, d

    if best_d <= 0:
        return [], 0.0

    samples = max(2, samples)
    path = [_interpolate(best_a, best_b, i / (samples - 1)) for i in range(samples)]
    return path, best_d
