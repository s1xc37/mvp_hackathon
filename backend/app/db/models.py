import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


class LayerType(enum.Enum):
    standard = "standard"
    thin = "thin"


class LaneCondition(enum.Enum):
    good = "Хорошее"
    satisfactory = "Удовлетворительное"
    poor = "Плохое"
    critical = "Критическое"


class VehicleType(enum.Enum):
    dump_truck = "dump_truck"
    transfer_machine = "transfer_machine"
    paver = "paver"
    roller = "roller"
    closure_vehicle = "closure_vehicle"


class SiteORM(Base):
    __tablename__ = "sites"

    id = Column(String, primary_key=True)
    numeric_id = Column(Integer, default=0)
    name = Column(String, nullable=False)
    km_marker = Column(Integer, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    polygon = Column(JSON, nullable=False)
    photo = Column(String, nullable=True)
    width_m = Column(Float, nullable=False)
    length_m = Column(Float, nullable=False)
    layer_type = Column(Enum(LayerType), nullable=False)
    plant_id = Column(String, ForeignKey("plants.id"), nullable=True)
    delivery_time_min = Column(Integer, nullable=False)
    repair_hours = Column(Integer, default=72)
    weather_suitable = Column(Boolean, nullable=True)
    weather_note = Column(String, default="")
    weather_windows = Column(JSON, default=list)

    plant = relationship("PlantORM", back_populates="sites")
    lanes = relationship("LaneORM", back_populates="site", cascade="all, delete-orphan",
                         order_by="LaneORM.num")
    green_windows = relationship("GreenWindowORM", back_populates="site", cascade="all, delete-orphan")


class LaneORM(Base):
    __tablename__ = "lanes"

    site_id = Column(String, ForeignKey("sites.id"), primary_key=True)
    num = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    condition = Column(Enum(LaneCondition), nullable=False)
    last_paved = Column(Date, nullable=False)
    repair_hours = Column(Integer, default=72)
    weather_suitable = Column(Boolean, nullable=True)
    weather_note = Column(String, default="")
    weather_windows = Column(JSON, default=list)

    site = relationship("SiteORM", back_populates="lanes")


class PlantORM(Base):
    __tablename__ = "plants"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    capacity_t_per_hour = Column(Float, nullable=False)
    mix_temp_c = Column(Integer, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    materials = Column(JSON, default=list)

    sites = relationship("SiteORM", back_populates="plant")


class ParkingORM(Base):
    __tablename__ = "parkings"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    coords = Column(JSON, nullable=False)


class VehicleORM(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True)
    type = Column(Enum(VehicleType), nullable=False)
    name = Column(String, nullable=False)
    coords = Column(JSON, nullable=True)
    speed_kmh = Column(Integer, default=0)
    current_task = Column(String, nullable=True)
    location_type = Column(String, nullable=True)
    location_name = Column(String, nullable=True)
    home_type = Column(String, nullable=True)
    home_id = Column(String, nullable=True)
    capacity_t = Column(Float, default=0.0, nullable=False)
    load_t = Column(Float, default=0.0, nullable=False)
    is_heated = Column(Boolean, default=False, nullable=False)
    schedule = Column(JSON, default=list)


class GreenWindowORM(Base):
    __tablename__ = "green_windows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    site_id = Column(String, ForeignKey("sites.id"), nullable=False)
    site_name = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    slots = Column(JSON, nullable=False)
    order_deadline = Column(DateTime, nullable=True)
    warnings = Column(JSON, default=list)

    site = relationship("SiteORM", back_populates="green_windows")
