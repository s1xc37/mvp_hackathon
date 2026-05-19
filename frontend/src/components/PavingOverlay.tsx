import { useMemo } from 'react';
import { Placemark, useYMaps } from '@pbe/react-yandex-maps';
import type { PavingState } from '@/hooks/usePavingSimulation';
import type { PavingRoute } from '@/types/paving';

interface TruckMarkerProps {
  coords: [number, number];
  heading: number;
  speedKmh: number;
  loadT?: number;
  capacityT?: number;
}

export function TruckMarker({ coords, heading, speedKmh, loadT, capacityT }: TruckMarkerProps) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const loadBadge = (capacityT ?? 0) > 0
    ? `<div style="position:absolute;top:-8px;right:-10px;background:#a16207;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;white-space:nowrap;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${(loadT ?? 0).toFixed(1)}/${capacityT}т</div>`
    : '';
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    return ymaps.templateLayoutFactory.createClass(
      `<div style="display:inline-block;position:relative;transform:translate(-50%,-50%);">
         <div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
           <span style="font-size:28px;line-height:1;display:inline-block;transform:rotate(${heading - 90}deg);transform-origin:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));">🚚</span>
         </div>
         ${loadBadge}
         <div style="position:absolute;top:38px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">${speedKmh} км/ч</div>
       </div>`,
    );
  }, [ymaps, heading, speedKmh, loadBadge]);
  if (!layout) return null;
  return (
    <Placemark geometry={coords}
      options={{ iconLayout: layout, iconShape: { type: 'Circle', coordinates: [18, 18], radius: 18 }, openBalloonOnClick: false, zIndex: 80 } as any} />
  );
}

interface PaverMarkerProps {
  coords: [number, number];
  heading: number;
  speedKmh: number;
  label: string;
}

export function PaverMarker({ coords, heading, speedKmh, label }: PaverMarkerProps) {
  const ymaps = useYMaps(['templateLayoutFactory']);
  const layout = useMemo(() => {
    if (!ymaps?.templateLayoutFactory) return null;
    return ymaps.templateLayoutFactory.createClass(
      `<div style="display:inline-block;position:relative;transform:translate(-50%,-50%);">
         <div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
           <span style="font-size:28px;line-height:1;display:inline-block;transform:rotate(${heading - 90}deg);transform-origin:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));">🚜</span>
         </div>
         <div style="position:absolute;top:38px;left:50%;transform:translateX(-50%);background:#a16207;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">${label} ${speedKmh} км/ч</div>
       </div>`,
    );
  }, [ymaps, heading, speedKmh, label]);
  if (!layout) return null;
  return (
    <Placemark geometry={coords}
      options={{ iconLayout: layout, iconShape: { type: 'Circle', coordinates: [18, 18], radius: 18 }, openBalloonOnClick: false, zIndex: 81 } as any} />
  );
}

interface ControlProps {
  routeInfo: PavingRoute | null;
  sim: PavingState;
  onClose: () => void;
  onReset: () => void;
}

const PHASE_LABEL: Record<PavingState['phase'], string> = {
  idle: 'Подготовка...',
  connecting: 'Подключение...',
  buffering: 'Расчёт траектории...',
  to_plant: 'Техника едет на АБЗ',
  loading: 'Загрузка асфальта',
  delivery: 'Доставка асфальта',
  waiting_weather: 'Ожидание погоды',
  paving: 'Укладка асфальта',
  done: 'Готово',
  error: 'Ошибка',
};

const PHASE_COLOR: Record<PavingState['phase'], string> = {
  idle: 'bg-slate-500',
  connecting: 'bg-amber-500',
  buffering: 'bg-amber-500',
  to_plant: 'bg-sky-600',
  loading: 'bg-amber-600',
  delivery: 'bg-blue-600',
  waiting_weather: 'bg-slate-500',
  paving: 'bg-orange-600',
  done: 'bg-emerald-700',
  error: 'bg-red-600',
};

export function PavingControlPanel({ routeInfo, sim, onClose, onReset }: ControlProps) {
  const overallPct = Math.round(sim.overallProgress * 100);
  const deliveryPct = Math.round(sim.deliveryProgress * 100);
  const pavingPct = Math.round(sim.pavingProgress * 100);
  const phaseLabel = sim.phase === 'error' ? (sim.error ?? 'Ошибка') : PHASE_LABEL[sim.phase];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white rounded-2xl shadow-2xl px-5 py-4 w-[min(600px,calc(100%-2rem))] border border-gray-200">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold px-2 py-0.5 ${PHASE_COLOR[sim.phase]} text-white rounded-full whitespace-nowrap`}>
            {phaseLabel}
          </span>
          {routeInfo && (
            <span className="text-xs text-gray-500 truncate">
              {routeInfo.plant_name} → {routeInfo.distance_km} км · участок {routeInfo.paving_length_m} м
            </span>
          )}
        </div>
        {sim.phase === 'waiting_weather' && (
          <span className="text-xs text-slate-500 animate-pulse shrink-0">⏳ Ждём окна...</span>
        )}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="flex justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            <span>🚚 Доставка</span><span>{deliveryPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${deliveryPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            <span>🚜 Укладка</span><span>{pavingPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-100" style={{ width: `${pavingPct}%` }} />
          </div>
        </div>
      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-gradient-to-r from-blue-500 via-amber-500 to-orange-600 transition-all duration-100"
             style={{ width: `${overallPct}%` }} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-600 font-medium">
          Прогресс: <span className="font-bold text-gray-900">{overallPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          {sim.phase === 'done' && (
            <button onClick={onClose}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1">
              <span>✓</span><span>Завершить</span>
            </button>
          )}
          <button onClick={onReset}
            className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors">
            ↺ Сброс
          </button>
        </div>
      </div>
    </div>
  );
}
