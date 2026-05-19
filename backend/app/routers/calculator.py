from fastapi import APIRouter

from app.schemas.calculator import CalcRequest, CalcResponse
from app.services.calculator import calculate_before_rain

router = APIRouter(prefix="/api/calculator", tags=["calculator"])


@router.post("/before-rain", response_model=CalcResponse)
async def before_rain(req: CalcRequest) -> CalcResponse:
    return calculate_before_rain(req)
