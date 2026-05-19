from abc import ABC, abstractmethod

from app.schemas.weather import WeatherPoint


class WeatherProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def get_forecast(self, lat: float, lon: float, hours: int = 24) -> list[WeatherPoint]:
        """Вернуть список почасовых точек прогноза."""
        ...
