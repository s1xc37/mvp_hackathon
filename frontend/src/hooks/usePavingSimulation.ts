import { useEffect, useRef, useState } from 'react';
import { useSimClock } from '@/sim/SimClock';
import { TRUCK_DISPLAY_KMH, PAVER_DISPLAY_KMH } from '@/sim/constants';
import type { PavingPhase, VehiclePlan } from '@/types/paving';

export interface VehicleSnapshot {
  lat: number;
  lon: number;
  heading: number;
  speedKmh: number;
}

export interface TruckSnap extends VehicleSnapshot {
  id: number;
  name: string;
  type: string;
  loadT: number;
  capacityT: number;
}

export interface PavingState {
  phase: PavingPhase;
  trucks: TruckSnap[];
  truck: VehicleSnapshot | null;
  truckTrail: [number, number][];
  toPlantProgress: number;
  loadingProgress: number;
  deliveryProgress: number;
  paver: VehicleSnapshot | null;
  pavingTrail: [number, number][];
  pavingProgress: number;
  overallProgress: number;
  error: string | null;
}

const INITIAL: PavingState = {
  phase: 'idle',
  trucks: [],
  truck: null,
  truckTrail: [],
  toPlantProgress: 0,
  loadingProgress: 0,
  deliveryProgress: 0,
  paver: null,
  pavingTrail: [],
  pavingProgress: 0,
  overallProgress: 0,
  error: null,
};

// Distribution of overall progress across phases
const P_TO_PLANT = 0.10;
const P_LOADING  = 0.05;
const P_DELIVERY = 0.35;
const P_PAVING   = 0.50;

const HAULER_TYPES = new Set(['dump_truck', 'transfer_machine']);

function bearingDeg(a: [number, number], b: [number, number]): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function interpolate(pts: [number, number][], t: number, speedKmh: number): VehicleSnapshot {
  const n = pts.length;
  if (n < 2) return { lat: pts[0][0], lon: pts[0][1], heading: 0, speedKmh };
  const pos = Math.min(n - 1, Math.max(0, t * (n - 1)));
  const i = Math.min(Math.floor(pos), n - 2);
  const frac = pos - i;
  const a = pts[i], b = pts[i + 1];
  return {
    lat: a[0] + (b[0] - a[0]) * frac,
    lon: a[1] + (b[1] - a[1]) * frac,
    heading: bearingDeg(a, b),
    speedKmh,
  };
}

function buildTruckSnaps(
  vehicles: VehiclePlan[],
  t: number,
  moving: boolean,
  loadFrac: number,
): TruckSnap[] {
  return vehicles
    .filter(v => HAULER_TYPES.has(v.vehicle_type))
    .map(v => {
      const route = v.to_plant_route;
      const speed = moving ? TRUCK_DISPLAY_KMH : 0;
      const snap = route.length >= 2
        ? interpolate(route, t, speed)
        : { lat: v.start_coords[0], lon: v.start_coords[1], heading: 0, speedKmh: speed };
      return {
        ...snap,
        id: v.vehicle_id,
        name: v.vehicle_name,
        type: v.vehicle_type,
        loadT: v.capacity_t * loadFrac,
        capacityT: v.capacity_t,
      };
    });
}

export function usePavingSimulation(
  route: [number, number][] | null,
  pavingPath: [number, number][] | null,
  vehicles: VehiclePlan[],
  loadMinutes: number,
  enabled: boolean,
  layerType: 'standard' | 'thin',
  repairHours: number,
  deliveryDurationMin: number,
  lanesShare: number,
  onDone: () => void,
  isSuitable: (t: Date) => boolean,
): PavingState {
  const { simNow } = useSimClock();
  const [state, setState] = useState<PavingState>(INITIAL);

  const phaseRef = useRef<PavingPhase>('idle');
  const prevSimRef = useRef(0);
  const toPlantElapsedRef = useRef(0);
  const loadingElapsedRef = useRef(0);
  const deliveryElapsedRef = useRef(0);
  const pavingElapsedRef = useRef(0);
  const T_toPlantRef = useRef(1_000_000);
  const T_loadRef = useRef(1_000_000);
  const T_delivRef = useRef(1_000_000);
  const T_pavRef = useRef(1_000_000);
  const doneFiredRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const isSuitableRef = useRef(isSuitable);
  const vehiclesRef = useRef<VehiclePlan[]>(vehicles);
  onDoneRef.current = onDone;
  isSuitableRef.current = isSuitable;
  vehiclesRef.current = vehicles;

  // Init / reset when route changes
  useEffect(() => {
    if (!enabled || !route || route.length < 2) {
      setState(INITIAL);
      phaseRef.current = 'idle';
      doneFiredRef.current = false;
      return;
    }

    const haulers = vehicles.filter(v => HAULER_TYPES.has(v.vehicle_type));
    const maxToPlantMin = haulers.reduce((m, v) => Math.max(m, v.to_plant_min), 0);

    T_toPlantRef.current = Math.max(2000, maxToPlantMin * 60 * 1000);
    T_loadRef.current = Math.max(2000, loadMinutes * 60 * 1000);
    T_delivRef.current = Math.max(2000, deliveryDurationMin * 60 * 1000);
    T_pavRef.current = Math.max(2000, repairHours * lanesShare * 3600 * 1000);

    const hasToPlant = haulers.length > 0 && maxToPlantMin > 0;
    phaseRef.current = hasToPlant ? 'to_plant' : 'loading';
    toPlantElapsedRef.current = 0;
    loadingElapsedRef.current = 0;
    deliveryElapsedRef.current = 0;
    pavingElapsedRef.current = 0;
    doneFiredRef.current = false;
    prevSimRef.current = simNow.getTime();

    setState({
      ...INITIAL,
      phase: phaseRef.current,
      trucks: buildTruckSnaps(vehicles, 0, hasToPlant, 0),
      truck: interpolate(route, 0, 0),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, route, pavingPath]);

  // Tick on every simNow change
  useEffect(() => {
    const phase = phaseRef.current;
    if (phase === 'idle' || phase === 'done' || phase === 'error') return;
    if (!route || route.length < 2) return;

    const nowMs = simNow.getTime();
    const dt = nowMs - prevSimRef.current;
    prevSimRef.current = nowMs;
    if (dt <= 0) return;

    if (phase === 'to_plant') {
      toPlantElapsedRef.current += dt;
      const t = Math.min(1, toPlantElapsedRef.current / T_toPlantRef.current);
      const trucks = buildTruckSnaps(vehiclesRef.current, t, true, 0);

      if (t >= 1) {
        phaseRef.current = 'loading';
        setState(s => ({
          ...s,
          phase: 'loading',
          trucks: buildTruckSnaps(vehiclesRef.current, 1, false, 0),
          toPlantProgress: 1,
          overallProgress: P_TO_PLANT,
        }));
      } else {
        setState(s => ({
          ...s,
          trucks,
          toPlantProgress: t,
          overallProgress: t * P_TO_PLANT,
        }));
      }
    } else if (phase === 'loading') {
      loadingElapsedRef.current += dt;
      const t = Math.min(1, loadingElapsedRef.current / T_loadRef.current);
      const trucks = buildTruckSnaps(vehiclesRef.current, 1, false, t);

      if (t >= 1) {
        phaseRef.current = 'delivery';
        setState(s => ({
          ...s,
          phase: 'delivery',
          trucks: buildTruckSnaps(vehiclesRef.current, 1, false, 1),
          truck: interpolate(route, 0, TRUCK_DISPLAY_KMH),
          truckTrail: [],
          loadingProgress: 1,
          overallProgress: P_TO_PLANT + P_LOADING,
        }));
      } else {
        setState(s => ({
          ...s,
          trucks,
          loadingProgress: t,
          overallProgress: P_TO_PLANT + t * P_LOADING,
        }));
      }
    } else if (phase === 'delivery') {
      deliveryElapsedRef.current += dt;
      const t = Math.min(1, deliveryElapsedRef.current / T_delivRef.current);
      const snap = interpolate(route, t, TRUCK_DISPLAY_KMH);
      const trailIdx = Math.min(Math.floor(t * (route.length - 1)), route.length - 1);
      const trail: [number, number][] = [...route.slice(0, trailIdx), [snap.lat, snap.lon]];

      if (t >= 1) {
        phaseRef.current = isSuitableRef.current(simNow) ? 'paving' : 'waiting_weather';
        pavingElapsedRef.current = 0;
        setState(s => ({
          ...s,
          phase: phaseRef.current,
          truck: snap,
          truckTrail: trail,
          trucks: [],
          deliveryProgress: 1,
          overallProgress: P_TO_PLANT + P_LOADING + P_DELIVERY,
        }));
      } else {
        setState(s => ({
          ...s,
          truck: snap,
          truckTrail: trail,
          deliveryProgress: t,
          overallProgress: P_TO_PLANT + P_LOADING + t * P_DELIVERY,
        }));
      }
    } else if (phase === 'paving') {
      if (!pavingPath || pavingPath.length < 2) return;

      if (!isSuitableRef.current(simNow)) {
        phaseRef.current = 'waiting_weather';
        setState(s => ({ ...s, phase: 'waiting_weather' }));
        return;
      }

      pavingElapsedRef.current += dt;
      const t = Math.min(1, pavingElapsedRef.current / T_pavRef.current);
      const snap = interpolate(pavingPath, t, PAVER_DISPLAY_KMH);
      const trailIdx = Math.min(Math.floor(t * (pavingPath.length - 1)), pavingPath.length - 1);
      const trail: [number, number][] = [...pavingPath.slice(0, trailIdx), [snap.lat, snap.lon]];

      setState(s => ({
        ...s,
        phase: 'paving',
        paver: snap,
        pavingTrail: trail,
        pavingProgress: t,
        overallProgress: P_TO_PLANT + P_LOADING + P_DELIVERY + t * P_PAVING,
      }));

      if (t >= 1) {
        phaseRef.current = 'done';
        setState(s => ({ ...s, phase: 'done', pavingProgress: 1, overallProgress: 1 }));
        if (!doneFiredRef.current) {
          doneFiredRef.current = true;
          onDoneRef.current();
        }
      }
    } else if (phase === 'waiting_weather') {
      if (isSuitableRef.current(simNow)) {
        const delivDone = deliveryElapsedRef.current >= T_delivRef.current;
        phaseRef.current = delivDone ? 'paving' : 'delivery';
        setState(s => ({ ...s, phase: phaseRef.current }));
      }
    }
  }, [simNow, route, pavingPath]);

  return state;
}
