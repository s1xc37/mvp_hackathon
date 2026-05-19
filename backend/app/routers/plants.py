from fastapi import APIRouter, HTTPException

from app.schemas.plant import Plant, PlantDetail
from app.services.fleet import get_plant_detail, list_plants

router = APIRouter(prefix="/api/plants", tags=["plants"])


@router.get("", response_model=list[Plant])
async def list_plants_route() -> list[Plant]:
    return list_plants()


@router.get("/{plant_id}", response_model=PlantDetail)
async def get_plant(plant_id: str) -> PlantDetail:
    detail = get_plant_detail(plant_id)
    if not detail:
        raise HTTPException(status_code=404, detail="АБЗ не найден")
    return detail
