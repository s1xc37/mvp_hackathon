import { useMemo } from 'react';
import { Placemark, useYMaps } from '@pbe/react-yandex-maps';
import type { AlertAction, PavingSim, PavingState } from '@/hooks/usePavingSimulation';
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

      {(sim.phase === 'loading' || sim.phase === 'delivery' || sim.phase === 'paving' || sim.phase === 'waiting_weather' || sim.phase === 'error') && sim.mixTempC > 0 && (
        <div className={`mb-3 px-2 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
          !sim.mixUsable
            ? 'bg-red-50 border-red-300 text-red-800'
            : sim.mixTempC < 145
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-emerald-50 border-emerald-300 text-emerald-800'
        }`}>
          <span className="font-semibold">
            🌡 Смесь {sim.phase === 'paving' ? 'в шнеке укладчика' : 'в кузове'}:{' '}
            <strong>{sim.mixTempC.toFixed(0)}°C</strong>
          </span>
          {sim.phase === 'delivery' && sim.mixUsable && (
            <span className="text-[10px] opacity-80">→ прибудет {sim.mixTempArrivalC.toFixed(0)}°C</span>
          )}
          {!sim.mixUsable && (
            <span className="text-[10px] font-bold">⛔ Ниже ГОСТ-минимума 140°C</span>
          )}
        </div>
      )}

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


// ── Критическая модалка: смесь стынет / погода ухудшилась ───────────────────

const REASON_TITLE: Record<string, string> = {
  cold_mix: '🌡 Смесь критически остыла',
  bad_weather: '🌧 Погода вышла из окна',
  both: '⚠ Смесь остыла и погода испортилась',
};

const REASON_SUB: Record<string, string> = {
  cold_mix: 'Смесь стынет дольше, чем удаётся уложить — фуры стояли в очереди / доехали холодными',
  bad_weather: 'Условия резко изменились во время укладки',
  both: 'Двойная проблема: температура и погода одновременно',
};

const REASON_DESC: Record<string, string> = {
  cold_mix: 'Температура смеси упала ниже ГОСТ-минимума 140°C из-за длительной задержки. Дальнейшая укладка нарушит технологию (ГОСТ Р 58406.2-2020, п. 3.3.16).',
  bad_weather: 'На участке начался дождь / резкое похолодание / сильный ветер. Укладка нарушит ГОСТ Р 58406.2.',
  both: 'Смесь холодная И погода неподходящая. Решайте срочно: брак либо снимут, либо потерпит АБЗ.',
};

interface AlertModalProps {
  sim: PavingSim;
  routeInfo: PavingRoute | null;
}

export function CriticalAlertModal({ sim, routeInfo }: AlertModalProps) {
  const a = sim.criticalAlert;
  if (!a) return null;

  const handle = (action: AlertAction) => () => sim.acknowledgeAlert(action);
  
  // if (a.reason === '🌡 Смесь критически остыла') return('')

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-orange-600 px-5 py-3 text-white">
          <p className="text-base font-bold">{REASON_TITLE[a.reason]}</p>
          <p className="text-xs text-white/90 mt-0.5">{REASON_SUB[a.reason]}</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {a.startedOutsideWindow && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
              <span>⚠</span>
              <span>Укладка была запущена <strong>вне зелёного окна</strong> — риск был принят оператором.</span>
            </div>
          )}
          <p className="text-sm text-gray-700">{REASON_DESC[a.reason]}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">T смеси</p>
              <p className={`text-lg font-bold ${a.mixTempC < 140 ? 'text-red-700' : 'text-amber-700'}`}>
                {a.mixTempC.toFixed(0)}°C
              </p>
              <p className="text-[10px] text-gray-500">мин. по ГОСТ 140°C</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Уложено</p>
              <p className="text-lg font-bold text-emerald-700">
                {a.pavedT.toFixed(1)} <span className="text-xs text-gray-500">т</span>
              </p>
              <p className="text-[10px] text-gray-500">
                {Math.round(a.pavingPct * 100)}% от заказа · из {a.orderTotalT.toFixed(0)} т
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 border border-red-200">
              <p className="text-[10px] uppercase text-red-700 font-semibold tracking-wider">В фурах (риск)</p>
              <p className="text-lg font-bold text-red-700">
                {a.inTrucksT.toFixed(1)} <span className="text-xs text-red-500">т</span>
              </p>
              <p className="text-[10px] text-red-600">горячая смесь в пути</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Не выехало с АБЗ</p>
              <p className="text-lg font-bold text-gray-700">
                {a.notDeliveredT.toFixed(1)} <span className="text-xs text-gray-500">т</span>
              </p>
              <p className="text-[10px] text-gray-500">можно отменить без потерь</p>
            </div>
          </div>

          {(a.weatherBad || routeInfo) && (
            <div className="flex items-center justify-between text-[11px] text-gray-600 bg-gray-50 rounded-md px-2 py-1 border border-gray-200">
              <span>
                Погода: <strong className={a.weatherBad ? 'text-red-700' : 'text-emerald-700'}>
                  {a.weatherBad ? 'НЕ ГОДНА' : 'ок'}
                </strong>
              </span>
              {routeInfo && <span className="truncate ml-2">🏭 {routeInfo.plant_name}</span>}
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Решение оператора:</p>

            <button onClick={handle('utilize')}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-red-50 border-2 border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors text-left">
              <span className="text-2xl">🗑</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-red-800">Утилизировать смесь</p>
                <p className="text-[11px] text-red-700">
                  Холодная смесь в фурах ({a.inTrucksT.toFixed(0)} т) на свалку.
                  Не выехавшие с АБЗ ({a.notDeliveredT.toFixed(0)} т) отменяем — потерь нет.
                </p>
              </div>
            </button>

            <button onClick={handle('reroute')}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-amber-50 border-2 border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors text-left">
              <span className="text-2xl">🔀</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-800">Перенаправить на другой участок</p>
                <p className="text-[11px] text-amber-700">
                  Смесь в фурах ({a.inTrucksT.toFixed(0)} т) уходит на участок где погода годная.
                  Сохраним материал, но прервём текущую укладку.
                </p>
              </div>
            </button>

            <button onClick={handle('wait')}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-colors text-left">
              <span className="text-2xl">⏳</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">Ждать улучшения</p>
                <p className="text-[11px] text-slate-600">
                  Стоим, ждём окно. <strong>Внимание:</strong> смесь продолжает стынуть.
                  Если упадёт ниже 140°C — придётся утилизировать.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
