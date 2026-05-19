from datetime import date
from typing import Literal
from pydantic import BaseModel

Condition = Literal["Хорошее", "Удовлетворительное", "Плохое", "Критическое"]


class Lane(BaseModel):
    id: int
    name: str
    direction: str
    condition: Condition
    last_paved: date


class LanePolygon(BaseModel):
    lane_id: int
    polygon: list[list[float]]
