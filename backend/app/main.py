from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core import deps
from app.db.seed import init_db
from app.routers import (
    auth,
    calculator,
    factories,
    green_window,
    health,
    lanes,
    logistics,
    maintenance,
    parkings,
    paving,
    plans,
    plants,
    roads,
    sites,
    vehicles,
    weather,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    await deps.startup()
    yield
    await deps.shutdown()


app = FastAPI(
    title="АБП Планировщик — API",
    description="Планирование укладки асфальтобетонного покрытия по прогнозу погоды",
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(roads.router)
app.include_router(sites.router)
app.include_router(lanes.router)
app.include_router(plants.router)
app.include_router(factories.router)
app.include_router(parkings.router)
app.include_router(vehicles.router)
app.include_router(weather.router)
app.include_router(green_window.router)
app.include_router(calculator.router)
app.include_router(maintenance.router)
app.include_router(logistics.router)
app.include_router(plans.router)
app.include_router(paving.router)
app.include_router(auth.router)
