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

export type AlertReason = 'cold_mix' | 'bad_weather' | 'both';
export type AlertAction = 'utilize' | 'reroute' | 'wait';

export interface CriticalAlert {
  reason: AlertReason;
  mixTempC: number;
  weatherBad: boolean;
  startedOutsideWindow: boolean;
  pavingPct: number;       // 0..1 — прогресс укладки
  orderTotalT: number;     // фактический заказ за окно
  pavedT: number;          // уложено из заказа
  inTrucksT: number;       // сейчас горячая смесь в пути (риск утилизации)
  notDeliveredT: number;   // не выехали с АБЗ (можно безопасно отменить)
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
  mixTempC: number;          // текущая температура смеси (фазы loading/delivery/paving)
  mixTempArrivalC: number;   // прогноз: какой приедет на участок
  mixUsable: boolean;        // ≥ 140°C
  criticalAlert: CriticalAlert | null;
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
  mixTempC: 0,
  mixTempArrivalC: 0,
  mixUsable: true,
  criticalAlert: null,
  error: null,
};

const MIX_USABLE_MIN_C = 140;
const MIX_PAVING_MIN_C = 80; // ниже — уплотнение невозможно по ГОСТ 3.3.22

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

function effectiveLoad(v: VehiclePlan): number {
  return v.load_t > 0 ? v.load_t : v.capacity_t;
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
        loadT: effectiveLoad(v) * loadFrac,
        capacityT: v.capacity_t,
      };
    });
}

// Конвейер на маршруте АБЗ→участок: каждая фура стартует с departure_offset_min задержкой.
function buildDeliverySnaps(
  vehicles: VehiclePlan[],
  route: [number, number][],
  elapsedSimMin: number,
  totalSimMin: number,
): TruckSnap[] {
  if (route.length < 2) return [];
  return vehicles
    .filter(v => HAULER_TYPES.has(v.vehicle_type))
    .map(v => {
      const tRaw = (elapsedSimMin - v.departure_offset_min) / totalSimMin;
      const t = Math.max(0, Math.min(1, tRaw));
      const visible = tRaw > 0;
      const snap = interpolate(route, t, visible ? TRUCK_DISPLAY_KMH : 0);
      return {
        ...snap,
        id: v.vehicle_id,
        name: v.vehicle_name,
        type: v.vehicle_type,
        loadT: visible ? effectiveLoad(v) : 0,
        capacityT: v.capacity_t,
      };
    })
    .filter(s => s.loadT > 0 || elapsedSimMin > 0);
}

export interface PavingSim extends PavingState {
  acknowledgeAlert: (action: AlertAction) => void;
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
  mixStartC: number,             // T смеси на выходе с АБЗ
  coolRate: number,              // °C/мин в кузове
  coolRateWaiting: number,       // °C/мин на участке/в укладчике
  orderTotalT: number,           // фактический заказ за окно (n × load × trips)
  loadPerTruckT: number,         // загрузка одного рейса
  nTrucks: number,               // количество фур-перевозчиков
  onDone: () => void,
  isSuitable: (t: Date) => boolean,
): PavingSim {
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
  const startedOutsideWindowRef = useRef(false);
  const alertFiredRef = useRef(false);
  const mixTempRef = useRef(0);
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
    alertFiredRef.current = false;
    // Запомним: запустили ли в годное окно (если nope — это форс-мажор)
    startedOutsideWindowRef.current = !isSuitable(simNow);
    prevSimRef.current = simNow.getTime();
    mixTempRef.current = mixStartC;

    const arrivalC = mixStartC - coolRate * deliveryDurationMin;
    setState({
      ...INITIAL,
      phase: phaseRef.current,
      trucks: buildTruckSnaps(vehicles, 0, hasToPlant, 0),
      truck: interpolate(route, 0, 0),
      mixTempC: mixStartC,
      mixTempArrivalC: Math.round(arrivalC * 10) / 10,
      mixUsable: arrivalC >= MIX_USABLE_MIN_C,
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

      const elapsedSimMin = (deliveryElapsedRef.current / T_delivRef.current) * deliveryDurationMin;
      const currentMixC = mixStartC - coolRate * elapsedSimMin;
      mixTempRef.current = currentMixC;

      const convoy = buildDeliverySnaps(
        vehiclesRef.current, route, elapsedSimMin, deliveryDurationMin,
      );

      const weatherBad = !isSuitableRef.current(simNow);
      const tooCold = currentMixC < MIX_USABLE_MIN_C;
      if ((tooCold || weatherBad) && !alertFiredRef.current) {
        alertFiredRef.current = true;
        phaseRef.current = 'waiting_weather';
        // В фазе delivery ещё ничего не уложено. Часть фур (та что выехала) везёт смесь.
        const trucksOnRoad = Math.min(nTrucks, Math.max(1, Math.ceil(t * nTrucks)));
        const inTrucksT = trucksOnRoad * loadPerTruckT;
        const notDeliveredT = Math.max(0, orderTotalT - inTrucksT);
        const alert: CriticalAlert = {
          reason: tooCold && weatherBad ? 'both' : tooCold ? 'cold_mix' : 'bad_weather',
          mixTempC: Math.round(currentMixC * 10) / 10,
          weatherBad,
          startedOutsideWindow: startedOutsideWindowRef.current,
          pavingPct: 0,
          orderTotalT: Math.round(orderTotalT * 10) / 10,
          pavedT: 0,
          inTrucksT: Math.round(inTrucksT * 10) / 10,
          notDeliveredT: Math.round(notDeliveredT * 10) / 10,
        };
        setState(s => ({
          ...s,
          phase: 'waiting_weather',
          truck: snap,
          truckTrail: trail,
          deliveryProgress: t,
          mixTempC: Math.round(currentMixC * 10) / 10,
          mixUsable: !tooCold,
          criticalAlert: alert,
        }));
        return;
      }

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
          mixTempC: Math.round(currentMixC * 10) / 10,
          mixUsable: currentMixC >= MIX_USABLE_MIN_C,
        }));
      } else {
        setState(s => ({
          ...s,
          truck: snap,
          truckTrail: trail,
          trucks: convoy,
          deliveryProgress: t,
          overallProgress: P_TO_PLANT + P_LOADING + t * P_DELIVERY,
          mixTempC: Math.round(currentMixC * 10) / 10,
          mixUsable: currentMixC >= MIX_USABLE_MIN_C,
        }));
      }
    } else if (phase === 'paving') {
      if (!pavingPath || pavingPath.length < 2) return;

      pavingElapsedRef.current += dt;
      const t = Math.min(1, pavingElapsedRef.current / T_pavRef.current);
      const snap = interpolate(pavingPath, t, PAVER_DISPLAY_KMH);
      const trailIdx = Math.min(Math.floor(t * (pavingPath.length - 1)), pavingPath.length - 1);
      const trail: [number, number][] = [...pavingPath.slice(0, trailIdx), [snap.lat, snap.lon]];

      // Остывание во время укладки (медленнее чем в кузове? нет — на участке быстрее).
      // dt относится к T_pavRef. Сколько виртуальных минут прошло:
      const pavingDurationMin = T_pavRef.current / (60 * 1000);
      const elapsedPavMin = (pavingElapsedRef.current / T_pavRef.current) * pavingDurationMin;
      // mixTempRef.current — температура на момент входа в paving. Падает по coolRateWaiting.
      const currentMixC = mixTempRef.current - coolRateWaiting * elapsedPavMin;

      const weatherBad = !isSuitableRef.current(simNow);
      const tooCold = currentMixC < MIX_USABLE_MIN_C;
      if ((tooCold || weatherBad) && !alertFiredRef.current) {
        alertFiredRef.current = true;
        phaseRef.current = 'waiting_weather';
        const paved = orderTotalT * t;
        const remaining = Math.max(0, orderTotalT - paved);
        // Сейчас в фурах в пути — максимум один цикл конвейера (n_trucks × load)
        const inTrucks = Math.min(remaining, nTrucks * loadPerTruckT);
        const notDelivered = Math.max(0, remaining - inTrucks);
        const alert: CriticalAlert = {
          reason: tooCold && weatherBad ? 'both' : tooCold ? 'cold_mix' : 'bad_weather',
          mixTempC: Math.round(currentMixC * 10) / 10,
          weatherBad,
          startedOutsideWindow: startedOutsideWindowRef.current,
          pavingPct: t,
          orderTotalT: Math.round(orderTotalT * 10) / 10,
          pavedT: Math.round(paved * 10) / 10,
          inTrucksT: Math.round(inTrucks * 10) / 10,
          notDeliveredT: Math.round(notDelivered * 10) / 10,
        };
        setState(s => ({
          ...s,
          phase: 'waiting_weather',
          paver: snap,
          pavingTrail: trail,
          pavingProgress: t,
          mixTempC: Math.round(currentMixC * 10) / 10,
          mixUsable: !tooCold,
          criticalAlert: alert,
        }));
        return;
      }

      setState(s => ({
        ...s,
        phase: 'paving',
        paver: snap,
        pavingTrail: trail,
        pavingProgress: t,
        overallProgress: P_TO_PLANT + P_LOADING + P_DELIVERY + t * P_PAVING,
        mixTempC: Math.round(currentMixC * 10) / 10,
        mixUsable: !tooCold,
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
      // В waiting_weather смесь продолжает стынуть (в кузове и в шнеке)
      const wMin = (dt / 60000);
      const newMix = mixTempRef.current - coolRateWaiting * wMin;
      mixTempRef.current = newMix;
      setState(s => ({
        ...s,
        mixTempC: Math.round(newMix * 10) / 10,
        mixUsable: newMix >= MIX_USABLE_MIN_C,
      }));

      // Авто-возврат к работе только если алерт не висит
      if (!alertFiredRef.current && isSuitableRef.current(simNow) && newMix >= MIX_USABLE_MIN_C) {
        const delivDone = deliveryElapsedRef.current >= T_delivRef.current;
        phaseRef.current = delivDone ? 'paving' : 'delivery';
        setState(s => ({ ...s, phase: phaseRef.current }));
      }
    }
  }, [simNow, route, pavingPath]);

  const acknowledgeAlert = (action: AlertAction) => {
    if (action === 'utilize') {
      phaseRef.current = 'error';
      setState(s => ({
        ...s,
        phase: 'error',
        criticalAlert: null,
        error: `Смесь утилизирована по решению оператора (T=${s.mixTempC.toFixed(0)}°C).`,
      }));
    } else if (action === 'reroute') {
      phaseRef.current = 'error';
      setState(s => ({
        ...s,
        phase: 'error',
        criticalAlert: null,
        error: 'Бригада перенаправлена на другой участок. Текущая укладка остановлена.',
      }));
      // onDoneRef не вызываем — это не успешное завершение
    } else if (action === 'wait') {
      // Продолжаем стынуть; сбрасываем триггер, чтобы алерт мог вылететь снова если станет хуже
      alertFiredRef.current = false;
      setState(s => ({ ...s, criticalAlert: null }));
    }
  };

  return { ...state, acknowledgeAlert };
}
