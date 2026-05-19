from pydantic import BaseModel
from app.schemas.vehicle import VehicleSummary


class Parking(BaseModel):
    id: int
    name: str
    coords: list[float]
    vehicle_count: int = 0


class ParkingDetail(Parking):
    vehicles: list[VehicleSummary] = []
