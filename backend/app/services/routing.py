from app.core.data_utils import load_sites
from app.core.geo import haversine_km
from app.schemas.logistics import RerouteOption, RerouteRequest, RerouteResponse


def reroute(req: RerouteRequest) -> RerouteResponse:
    sites = load_sites()
    blocked = next((s for s in sites if s.id == req.blocked_site_id), None)
    if not blocked:
        return RerouteResponse(
            blocked_site_id=req.blocked_site_id,
            options=[],
            recommendation="Участок не найден.",
        )

    options: list[RerouteOption] = []
    for site in sites:
        if site.id == req.blocked_site_id:
            continue
        dist = haversine_km(blocked.lat, blocked.lon, site.lat, site.lon)
        # доп. время в пути ~ 1 км/мин на трассе
        extra_min = int(dist * 1.2)
        # рекомендуем не более 80% от тоннажа (запас на дорогу)
        recommended_t = round(req.available_tonnage_t * 0.8, 1)
        options.append(
            RerouteOption(
                site_id=site.id,
                site_name=site.name,
                distance_km=round(dist, 1),
                extra_time_min=extra_min,
                has_green_window=True,
                recommended_tonnage_t=recommended_t,
            )
        )

    options.sort(key=lambda o: o.distance_km)
    best = options[0] if options else None
    recommendation = (
        f"Ближайший свободный участок: {best.site_name} ({best.distance_km} км). "
        f"Перенаправить {best.recommended_tonnage_t} т."
        if best
        else "Нет доступных участков для перенаправления."
    )

    return RerouteResponse(
        blocked_site_id=req.blocked_site_id,
        options=options,
        recommendation=recommendation,
    )
