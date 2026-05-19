from fastapi import APIRouter, HTTPException

from app.schemas.parking import Parking, ParkingDetail
from app.services.fleet import get_parking, list_parkings

router = APIRouter(prefix="/api/parkings", tags=["parkings"])


@router.get("", response_model=list[Parking])
async def list_parkings_route() -> list[Parking]:
    return list_parkings()


@router.get("/{parking_id}", response_model=ParkingDetail)
async def get_parking_route(parking_id: int) -> ParkingDetail:
    result = get_parking(parking_id)
    if not result:
        raise HTTPException(status_code=404, detail="Стоянка не найдена")
    return result
