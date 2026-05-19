from fastapi import APIRouter, HTTPException

from app.core.data_utils import get_site_by_id, load_sites
from app.schemas.site import Site

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("", response_model=list[Site])
async def list_sites() -> list[Site]:
    return load_sites()


@router.get("/{site_id}", response_model=Site)
async def get_site(site_id: str) -> Site:
    site = get_site_by_id(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    return site
