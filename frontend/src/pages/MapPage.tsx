import React, { useState, useEffect, useMemo, useRef } from 'react';
import { YMaps, Map, Placemark, Polygon, Polyline, useYMaps } from '@pbe/react-yandex-maps';
import type { Road } from '@/types/road';
import type { Factory } from '@/types/factory';
import type { Parking } from '@/types/parking';
import type { VehicleSummary, VehicleType } from '@/types/vehicle';
import type { PanelState } from '@/components/PanelVehicle';
import { getRoads, getRoad } from '@/api/roads';
import { getFactories, getFactory } from '@/api/factories';
import { getParkings, getParking } from '@/api/parkings';
import { getVehicles, getVehicle } from '@/api/vehicles';
import { VEHICLE_ICON } from '@/components/PanelVehicle';
import LeftPanel from '@/components/LeftPanel';
import PanelRoad from '@/components/PanelRoad';
import PanelVehicle from '@/components/PanelVehicle';
import LineInformation from '@/components/LineInformation';
import MaintenancePanel from '@/components/MaintenancePanel';
import ReroutePanel from '@/components/ReroutePanel';
import { TruckMarker, PaverMarker, PavingControlPanel } from '@/components/PavingOverlay';
import MapTimeline from '@/components/MapTimeline';
import { usePavingSimulation } from '@/hooks/usePavingSimulation';
import { buildPavingRoute, completePaving, resetDemo } from '@/api/paving';
import type { PavingRoute } from '@/types/paving';
import { useSimClock } from '@/sim/SimClock';
import { useForecast } from '@/sim/useForecast';

const MAP_CENTER: [number, number] = [57.0, 35.5];
const MAP_ZOOM = 7;

const COND_COLOR: Record<string, string> = {
  'Хорошее':            '#22c55e',
  'Удовлетворительное': '#eab308',
  'Плохое':             '#f97316',
  'Критическое':        '#ef4444',
};
const COLOR_NO_WINDOW = '#3b82f6';

interface PolyEdit { roadId: string; points: [number, number][] }

function makeIconHtml(emoji: string, name: string, count: number): string {
  const badge = count > 0
    ? `<div style="position:absolute;top:-6px;right:-8px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)">${count}</div>`
    : '';
  return (
    `<div style="position:relative;display:inline-block;text-align:center;transform:translate(-50%,-100%);cursor:pointer">` +
      `<div style="font-size:30px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))">${emoji}</div>` +
      badge +
      `<div style="margin-top:3px;background:rgba(30,30,30,.82);color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.3)">${name}</div>` +
    `</div>`
  );
}

function RoadLabel({ road, isActive, onClick }: { road: Road; isActive: boolean; onClick: () => void }) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    const bg = isActive ? 'rgba(234,88,12,0.95)' : 'rgba(30,30,30,0.80)';
    const border = isActive ? '#7c2d12' : '#475569';
    const shadow = isActive ? '0 2px 8px rgba(124,45,18,.5)' : '0 1px 4px rgba(0,0,0,.3)';
    return ymaps.templateLayoutFactory.createClass(
      `<div style="transform:translate(-50%,-100%);cursor:pointer;text-align:center">` +
        `<div style="display:inline-block;background:${bg};color:#fff;font-size:11px;font-weight:700;` +
        `padding:3px 8px;border-radius:6px;border:1.5px solid ${border};` +
        `box-shadow:${shadow};white-space:nowrap;letter-spacing:0.01em">` +
          `🛣️ ${road.name}` +
        `</div>` +
        `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;` +
        `border-top:5px solid ${border};margin:0 auto"></div>` +
      `</div>`
    );
  }, [ymaps, road.name, isActive]);
  if (!layout) return null;
  return (
    <Placemark geometry={road.coords ?? [road.lat, road.lon]}
      options={{ iconLayout: layout, iconShape: { type: 'Rectangle', coordinates: [[-80, -36], [80, 6]] }, openBalloonOnClick: false, zIndex: isActive ? 20 : 5 } as any}
      onClick={onClick} />
  );
}

function FactoryMarker({ factory, onClick }: { factory: Factory; onClick: () => void }) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    return ymaps.templateLayoutFactory.createClass(makeIconHtml('🏭', factory.name, factory.vehicle_count));
  }, [ymaps, factory.name, factory.vehicle_count]);
  if (!layout) return null;
  return (
    <Placemark geometry={[factory.lat, factory.lon]}
      options={{ iconLayout: layout, iconShape: { type: 'Rectangle', coordinates: [[-70, -65], [70, 8]] }, openBalloonOnClick: false } as any}
      properties={{ hintContent: factory.capacity_t_per_hour != null ? `${factory.name} — ${factory.capacity_t_per_hour} т/ч` : factory.name }}
      onClick={onClick} />
  );
}

function ParkingMarker({ parking, onClick }: { parking: Parking; onClick: () => void }) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    return ymaps.templateLayoutFactory.createClass(makeIconHtml('🅿️', parking.name, parking.vehicle_count));
  }, [ymaps, parking.name, parking.vehicle_count]);
  if (!layout) return null;
  return (
    <Placemark geometry={parking.coords}
      options={{ iconLayout: layout, iconShape: { type: 'Rectangle', coordinates: [[-70, -65], [70, 8]] }, openBalloonOnClick: false } as any}
      properties={{ hintContent: `${parking.name} — ${parking.vehicle_count} ед. техники` }}
      onClick={onClick} />
  );
}

function EditDotMarker({ point, index }: { point: [number, number]; index: number }) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    return ymaps.templateLayoutFactory.createClass(
      `<div style="width:20px;height:20px;background:#6366f1;border:2px solid #fff;border-radius:50%;` +
      `transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;` +
      `font-size:9px;font-weight:700;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:default">${index + 1}</div>`
    );
  }, [ymaps, index]);
  if (!layout) return null;
  return (
    <Placemark geometry={point}
      options={{ iconLayout: layout, iconShape: { type: 'Circle', coordinates: [0, 0], radius: 10 }, openBalloonOnClick: false, zIndex: 60 } as any}
      properties={{ hintContent: `Точка ${index + 1}: [${point[0].toFixed(6)}, ${point[1].toFixed(6)}]` }} />
  );
}

function VehicleMarker({ vehicle, onClick }: { vehicle: VehicleSummary; onClick: () => void }) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const icon = VEHICLE_ICON[vehicle.type] ?? '🚗';
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    const speedBadge = (vehicle.speed_kmh ?? 0) > 0
      ? `<div style="position:absolute;top:-6px;right:-8px;background:#2563eb;color:#fff;font-size:9px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${vehicle.speed_kmh}</div>`
      : '';
    return ymaps.templateLayoutFactory.createClass(
      `<div style="position:relative;display:inline-block;text-align:center;transform:translate(-50%,-100%);cursor:pointer">` +
        `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))">${icon}</div>` +
        speedBadge +
        `<div style="margin-top:2px;background:rgba(30,30,30,.85);color:#fff;font-size:9px;font-weight:600;padding:1px 5px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,.3)">${vehicle.name}</div>` +
      `</div>`
    );
  }, [ymaps, vehicle.type, vehicle.name, vehicle.speed_kmh]);
  if (!layout) return null;
  return (
    <Placemark geometry={vehicle.coords!}
      options={{ iconLayout: layout, iconShape: { type: 'Rectangle', coordinates: [[-65, -60], [65, 8]] }, openBalloonOnClick: false, zIndex: 30 } as any}
      properties={{ hintContent: `${icon} ${vehicle.name} — ${vehicle.current_task}` }}
      onClick={onClick} />
  );
}

export default function MapPage() {
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [roads, setRoads] = useState<Road[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [vehicleCounts, setVehicleCounts] = useState<Partial<Record<VehicleType, number>>>({});
  const [panel, setPanel] = useState<(PanelState & { type: 'road'; data: Road }) | PanelState | null>(null);
  const [showLanes, setShowLanes] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showReroute, setShowReroute] = useState(false);
  const [polyEdit, setPolyEdit] = useState<PolyEdit | null>(null);
  const [pavingRoute, setPavingRoute] = useState<PavingRoute | null>(null);
  const [pavingLaneNums, setPavingLaneNums] = useState<number[]>([]);
  const [pavingVehicleIds, setPavingVehicleIds] = useState<number[]>([]);
  const completedRef = useRef<string | null>(null);
  const [weatherCoords, setWeatherCoords] = useState<[number, number]>(MAP_CENTER);
  const { reset: resetClock } = useSimClock();
  const { isSuitable: checkForecast } = useForecast(weatherCoords[0], weatherCoords[1]);
  const pavingRoad = pavingRoute ? roads.find(r => r.id === pavingRoute.road_id) : null;
  const pavingLayerType = pavingRoad?.layer_type ?? 'standard';
  const pavingRepairHours = pavingRoad?.repair_hours ?? 72;
  const pavingDurationMin = pavingRoute?.duration_min ?? 60;
  const pavingLanesShare = pavingRoad && pavingLaneNums.length > 0
    ? Math.min(1, pavingLaneNums.length / Math.max(1, pavingRoad.lanes.length))
    : 1;

  const handlePavingDone = async () => {
    const roadId = pavingRoute?.road_id;
    if (!roadId || completedRef.current === roadId) return;
    completedRef.current = roadId;
    try {
      await completePaving(roadId, pavingLaneNums, pavingVehicleIds);
      const fresh = await getRoads();
      setRoads(fresh);
    } catch (err) {
      console.error('completePaving:', err);
    }
  };

  const paving = usePavingSimulation(
    pavingRoute?.route ?? null,
    pavingRoute?.paving_path ?? null,
    pavingRoute?.vehicles ?? [],
    pavingRoute?.load_minutes ?? 30,
    pavingRoute !== null,
    pavingLayerType,
    pavingRepairHours,
    pavingDurationMin,
    pavingLanesShare,
    handlePavingDone,
    (t: Date) => checkForecast(t, pavingLayerType),
  );

  useEffect(() => {
    Promise.all([getRoads(), getFactories(), getParkings(), getVehicles()])
      .then(([r, f, p, v]) => {
        setRoads(r);
        setFactories(f);
        setParkings(p);
        setVehicles(v);
        const counts: Partial<Record<VehicleType, number>> = {};
        v.forEach(vh => { counts[vh.type] = (counts[vh.type] ?? 0) + 1; });
        setVehicleCounts(counts);
      })
      .catch(console.error);
  }, []);

  const addPolyPoint = (e?: any) => {
    if (!polyEdit || !e) return;
    setPolyEdit(prev => prev ? { ...prev, points: [...prev.points, e.get('coords')] } : null);
  };

  const startPolyEdit  = (roadId: string) => setPolyEdit({ roadId, points: [] });
  const undoPolyEdit   = () => setPolyEdit(prev => prev ? { ...prev, points: prev.points.slice(0, -1) } : null);
  const cancelPolyEdit = () => setPolyEdit(null);
  const finishPolyEdit = () => {
    const pts = polyEdit?.points ?? [];
    if (pts.length >= 3) {
      console.log(`%c[Полигон участка id=${polyEdit?.roadId}]`, 'color:#6366f1;font-weight:bold;font-size:13px');
      console.log('"polygon": [');
      pts.forEach(([lat, lng]) => console.log(`    [${lat.toFixed(6)}, ${lng.toFixed(6)}],`));
      console.log('],');
    }
    setPolyEdit(null);
  };

  const flyTo = (coords: [number, number], zoom = 14) => {
    if (mapRef.current) mapRef.current.setCenter(coords, zoom, { duration: 600, checkZoomRange: true });
  };

  const openRoad = async (id: string) => {
    try {
      const road = roads.find(r => r.id === id);
      if (road) {
        flyTo([road.lat, road.lon], 14);
        setWeatherCoords([road.lat, road.lon]);
      }
      const data = await getRoad(id);
      setPanel({ type: 'road', data } as any);
    } catch (err) { console.error('openRoad:', err); }
  };

  const openParking = async (id: number) => {
    try {
      const p = parkings.find(pk => pk.id === id);
      if (p) flyTo(p.coords as [number, number], 13);
      const data = await getParking(id);
      setPanel({ type: 'parking', data });
    } catch (err) { console.error('openParking:', err); }
  };

  const openFactory = async (id: string) => {
    try {
      const f = factories.find(fc => fc.id === id);
      if (f) flyTo([f.lat, f.lon], 13);
      const data = await getFactory(id);
      setPanel({ type: 'factory', data });
    } catch (err) { console.error('openFactory:', err); }
  };

  const openVehicle = async (id: number) => {
    try {
      const data = await getVehicle(id);
      setPanel({ type: 'vehicle', data });
    } catch (err) { console.error('openVehicle:', err); }
  };

  const openVehicleType = async (type: VehicleType, typeName: string, typeIcon: string) => {
    try {
      const data = await getVehicles(type);
      setPanel({ type: 'fleet', data: { vehicles: data, typeName, typeIcon } });
    } catch (err) { console.error('openVehicleType:', err); }
  };

  const flyToVehicle = (coords: [number, number]) => flyTo(coords, 16);
  const closePanel = () => { setPanel(null); cancelPolyEdit(); };

  const startPaving = async (roadId: string, laneNums: number[], vehicleIds: number[]) => {
    try {
      completedRef.current = null;
      const data = await buildPavingRoute(roadId, vehicleIds);
      setPavingRoute(data);
      setPavingLaneNums(laneNums);
      setPavingVehicleIds(data.vehicles.map(v => v.vehicle_id));
      if (data.start) flyTo(data.start as [number, number], 11);
    } catch (err) {
      console.error('startPaving:', err);
      alert('Не удалось построить маршрут');
    }
  };
  const stopPaving = () => {
    setPavingRoute(null);
    completedRef.current = null;
    setPavingLaneNums([]);
    setPavingVehicleIds([]);
  };

  const handleReset = async () => {
    stopPaving();
    resetClock();
    try {
      await resetDemo();
      const fresh = await getRoads();
      setRoads(fresh);
    } catch (err) {
      console.error('resetDemo:', err);
    }
  };

  const activeRoadId = (panel as any)?.type === 'road' ? (panel as any)?.data?.id ?? null : null;
  const roadPanel = (panel as any)?.type === 'road' ? (panel as any) : null;
  const vehiclePanel = panel && ['parking', 'factory', 'fleet', 'vehicle'].includes(panel.type) ? panel as PanelState : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={dark ? { filter: 'invert(1) hue-rotate(180deg)' } : {}}>
      <LeftPanel
        dark={dark}
        onToggleDark={() => setDark(d => !d)}
        roads={roads}
        parkings={parkings}
        factories={factories}
        onSelectRoad={openRoad}
        onSelectParking={openParking}
        onSelectFactory={id => openFactory(id)}
        onSelectVehicleType={openVehicleType}
        onShowLanes={() => setShowLanes(true)}
        onShowReroute={() => setShowReroute(true)}
        vehicleCounts={vehicleCounts}
        activeRoadId={activeRoadId}
      />

      <div className="flex-1 relative">
        <YMaps query={{ lang: 'ru_RU', load: 'package.full' }}>
          <Map
            defaultState={{ center: MAP_CENTER, zoom: MAP_ZOOM }}
            style={{ width: '100%', height: '100%' }}
            options={{ suppressMapOpenBlock: true }}
            instanceRef={(ref: any) => { mapRef.current = ref; if (ref) setMapReady(true); }}
            onClick={addPolyPoint}
          >
            {mapReady && roads.map(r => {
              const isActive = activeRoadId === r.id;
              const hasWindows = (r.weather_windows?.length ?? 0) > 0;
              const fillOpacity = isActive ? 0.90 : 0.72;
              const handleClick = (e?: any) => { if (polyEdit) addPolyPoint(e); else openRoad(r.id); };

              const lanePolygons = (r.lane_polygons ?? []).map(lp => {
                const lane = r.lanes?.find(l => l.id === lp.lane_id);
                const fill = hasWindows ? (COND_COLOR[lane?.condition ?? ''] ?? '#94a3b8') : COLOR_NO_WINDOW;
                return (
                  <Polygon key={`road-lane-${r.id}-${lp.lane_id}`}
                    geometry={[lp.polygon]}
                    options={{ fillColor: fill, fillOpacity, strokeColor: '#ffffff', strokeOpacity: 0.25, strokeWidth: 0.5, openBalloonOnClick: false, zIndex: isActive ? 10 : 1 }}
                    properties={{ hintContent: lane ? `${r.name} · ${lane.name} (${lane.condition})` : r.name }}
                    onClick={handleClick} />
                );
              });

              return (
                <React.Fragment key={r.id}>
                  {lanePolygons}
                  <Polygon
                    geometry={[r.polygon]}
                    options={{ fillOpacity: 0, strokeColor: isActive ? '#ffffff' : '#1e293b', strokeOpacity: isActive ? 0.9 : 0.5, strokeWidth: isActive ? 2 : 1, openBalloonOnClick: false, zIndex: isActive ? 12 : 2 }}
                    onClick={handleClick} />
                  <RoadLabel road={r} isActive={isActive} onClick={handleClick} />
                </React.Fragment>
              );
            })}

            {mapReady && factories.map(f => (
              <FactoryMarker key={`factory-${f.id}`} factory={f} onClick={() => polyEdit ? null : openFactory(f.id)} />
            ))}

            {mapReady && parkings.map(p => (
              <ParkingMarker key={`parking-${p.id}`} parking={p} onClick={() => polyEdit ? null : openParking(p.id)} />
            ))}

            {mapReady && vehicles.filter(v => {
              if (!v.coords) return false;
              if (v.location_type === 'transit') return true;
              // Скрываем технику на участке пока там идёт укладка — она заменяется анимацией
              if (v.location_type === 'site') {
                const activeSiteId = paving.phase === 'paving' ? pavingRoute?.road_id : null;
                return v.home_id !== activeSiteId;
              }
              return false;
            }).map(v => (
              <VehicleMarker key={`vehicle-${v.id}`} vehicle={v} onClick={() => polyEdit ? null : openVehicle(v.id)} />
            ))}

            {mapReady && (polyEdit?.points.length ?? 0) >= 3 && (
              <Polygon geometry={[polyEdit!.points]}
                options={{ fillColor: '#6366f1', fillOpacity: 0.2, strokeColor: '#6366f1', strokeWidth: 2, strokeStyle: 'dash', openBalloonOnClick: false, zIndex: 50 }} />
            )}
            {mapReady && polyEdit?.points.map((pt, i) => (
              <EditDotMarker key={`edit-pt-${i}`} point={pt} index={i} />
            ))}

            {mapReady && pavingRoute && (paving.phase === 'delivery' || paving.phase === 'waiting_weather' || paving.phase === 'paving') && (
              <Polyline geometry={pavingRoute.route}
                options={{ strokeColor: '#94a3b8', strokeWidth: 4, strokeOpacity: 0.5, openBalloonOnClick: false, zIndex: 40 }} />
            )}
            {mapReady && (paving.phase === 'to_plant' || paving.phase === 'loading') && pavingRoute?.vehicles.map(v => (
              v.to_plant_route.length >= 2 && (
                <Polyline key={`vroute-${v.vehicle_id}`} geometry={v.to_plant_route}
                  options={{ strokeColor: '#60a5fa', strokeWidth: 3, strokeOpacity: 0.4, strokeStyle: 'dash', openBalloonOnClick: false, zIndex: 38 } as any} />
              )
            ))}
            {mapReady && paving.truckTrail.length >= 2 && (
              <Polyline geometry={paving.truckTrail}
                options={{ strokeColor: '#475569', strokeWidth: 5, strokeOpacity: 0.85, openBalloonOnClick: false, zIndex: 60 }} />
            )}
            {mapReady && pavingRoute?.paving_path && pavingRoute.paving_path.length >= 2 && (
              <Polyline geometry={pavingRoute.paving_path}
                options={{ strokeColor: '#fde68a', strokeWidth: 5, strokeOpacity: 0.4, strokeStyle: 'dash', openBalloonOnClick: false, zIndex: 65 }} />
            )}
            {mapReady && paving.pavingTrail.length >= 2 && (
              <Polyline geometry={paving.pavingTrail}
                options={{ strokeColor: '#1f2937', strokeWidth: 8, strokeOpacity: 0.95, openBalloonOnClick: false, zIndex: 71 }} />
            )}
            {mapReady && (paving.phase === 'to_plant' || paving.phase === 'loading') && paving.trucks.map(t => (
              <TruckMarker key={`truck-${t.id}`}
                coords={[t.lat, t.lon]}
                heading={t.heading}
                speedKmh={t.speedKmh}
                loadT={t.loadT}
                capacityT={t.capacityT} />
            ))}
            {mapReady && paving.truck && (paving.phase === 'delivery' || paving.phase === 'waiting_weather') && (
              <TruckMarker
                coords={[paving.truck.lat, paving.truck.lon]}
                heading={paving.truck.heading}
                speedKmh={paving.truck.speedKmh} />
            )}
            {mapReady && paving.paver && (paving.phase === 'delivery' || paving.phase === 'paving') && (
              <PaverMarker
                coords={[paving.paver.lat, paving.paver.lon]}
                heading={paving.paver.heading}
                speedKmh={paving.paver.speedKmh}
                label={paving.phase === 'paving' ? 'Укладка' : 'Везём'} />
            )}
          </Map>
        </YMaps>

        {polyEdit && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none flex items-center gap-2 whitespace-nowrap">
            <span>✏️</span>
            <span>Режим редактирования полигона — кликайте на карту</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full">{polyEdit.points.length} точек</span>
          </div>
        )}

        {showLanes && <LineInformation onClose={() => setShowLanes(false)} />}

        {showMaintenance && <MaintenancePanel roads={roads} onClose={() => setShowMaintenance(false)} />}

        {showReroute && <ReroutePanel roads={roads} onClose={() => setShowReroute(false)} />}

        {roadPanel && (
          <PanelRoad
            road={roadPanel.data}
            onClose={closePanel}
            polyEdit={polyEdit?.roadId === roadPanel.data?.id ? polyEdit : null}
            onStartPolyEdit={() => startPolyEdit(roadPanel.data.id)}
            onUndoPolyEdit={undoPolyEdit}
            onFinishPolyEdit={finishPolyEdit}
            onCancelPolyEdit={cancelPolyEdit}
            onShowMaintenance={() => setShowMaintenance(true)}
            onStartPaving={(laneNums, vehicleIds) => startPaving(roadPanel.data.id, laneNums, vehicleIds)}
            pavingActive={pavingRoute?.road_id === roadPanel.data?.id}
          />
        )}

        {pavingRoute && (
          <PavingControlPanel
            routeInfo={pavingRoute}
            sim={paving}
            onClose={stopPaving}
            onReset={handleReset} />
        )}

        {vehiclePanel && (
          <PanelVehicle panel={vehiclePanel} onClose={() => setPanel(null)} onSelectVehicle={openVehicle} onFlyToVehicle={flyToVehicle} />
        )}

        <MapTimeline
          lat={weatherCoords[0]}
          lon={weatherCoords[1]}
          locationName={roadPanel?.data?.name}
        />
      </div>
    </div>
  );
}
