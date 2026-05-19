from fastapi import APIRouter

from app.schemas.logistics import RerouteRequest, RerouteResponse
from app.services.routing import reroute

router = APIRouter(prefix="/api/logistics", tags=["logistics"])


@router.post("/reroute", response_model=RerouteResponse)
async def reroute_trucks(req: RerouteRequest) -> RerouteResponse:
    return reroute(req)
