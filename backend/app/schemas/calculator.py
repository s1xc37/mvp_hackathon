from typing import Literal
from pydantic import BaseModel, Field


class CalcRequest(BaseModel):
    site_id: str
    time_to_rain_min: int = Field(..., ge=0, description="Минут до дождя")
    mix_temp_c: int = Field(140, ge=100, le=160, description="Температура смеси на выходе °C")
    paver_width_m: float = Field(7.0, ge=2.0, le=7.5, description="Ширина укладчика м")
    layer_type: Literal["standard", "thin"] = "standard"


class CalcResponse(BaseModel):
    site_id: str
    time_to_rain_min: int
    compaction_time_min: int
    available_paving_min: int
    max_tonnage_t: float
    trucks_needed: int
    recommendation: str
    can_start: bool
