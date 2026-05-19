from fastapi import APIRouter, HTTPException, Query

from app.schemas.vehicle import Vehicle, VehicleSummary
from app.services.fleet import get_vehicle, list_vehicles

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleSummary])
async def list_vehicles_route(type: str | None = Query(None, description="Тип техники")) -> list[VehicleSummary]:
    return list_vehicles(type)


@router.get("/{vehicle_id}", response_model=Vehicle)
async def get_vehicle_route(vehicle_id: int) -> Vehicle:
    v = get_vehicle(vehicle_id)
    if not v:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    return v
