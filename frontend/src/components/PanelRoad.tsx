import { useEffect, useMemo, useState } from 'react';
import type { Road, Lane } from '@/types/road';
import type { VehicleSummary, VehicleType } from '@/types/vehicle';
import RoadScheme from './RoadScheme';
import WeatherPanel from './WeatherPanel';
import GreenWindowPanel from './GreenWindowPanel';
import CalculatorPanel from './CalculatorPanel';
import { getGreenWindow } from '@/api/greenWindow';
import { getVehicles } from '@/api/vehicles';
import { createPlan } from '@/api/plans';
import { autoBrigade } from '@/api/paving';
import { fmtTime } from '@/utils/time';
import type { GreenWindow } from '@/types/greenWindow';
import type { LogisticsPlan } from '@/types/paving';

interface PolyEdit { roadId: string; points: [number, number][] }

interface Props {
  road: Road;
  onClose: () => void;
  polyEdit: PolyEdit | null;
  onStartPolyEdit: () => void;
  onUndoPolyEdit: () => void;
  onFinishPolyEdit: () => void;
  onCancelPolyEdit: () => void;
  onShowMaintenance: () => void;
  onStartPaving: (laneNums: number[], vehicleIds: number[], loadTPerTruck?: number) => void;
  pavingActive: boolean;
}

const VEHICLE_TYPES: { type: VehicleType; icon: string; label: string }[] = [
  { type: 'dump_truck',       icon: '🚛', label: 'Самосвалы' },
  { type: 'transfer_machine', icon: '🏗️', label: 'Перегружатель' },
  { type: 'paver',            icon: '🚜', label: 'Асфальтоукладчик' },
  { type: 'roller',           icon: '🛞', label: 'Каток' },
  { type: 'closure_vehicle',  icon: '🚧', label: 'Перекрытие' },
];

type Mode = 'road' | 'lanes';

function pluralDays(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 19) return 'дней';
  const r = n % 10;
  if (r === 1) return 'день';
  if (r >= 2 && r <= 4) return 'дня';
  return 'дней';
}

function pluralLanes(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 19) return 'полос';
  const r = n % 10;
  if (r === 1) return 'полоса';
  if (r >= 2 && r <= 4) return 'полосы';
  return 'полос';
}

interface VSelectorProps {
  type: VehicleType;
  pool: VehicleSummary[];
  selected: VehicleSummary[];
  onAdd: (v: VehicleSummary) => void;
  onRemove: (id: number) => void;
}

function VehicleSelector({ type, pool, selected, onAdd, onRemove }: VSelectorProps) {
  const available = pool.filter(v => !selected.some(s => s.id === v.id));
  return (
    <div className="space-y-1">
      {selected.map(v => (
        <div key={v.id} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-md px-2 py-1 gap-2">
          <span className="text-xs font-medium text-gray-800 truncate flex items-center gap-1">
            {v.name}
            {v.type === 'dump_truck' && (
              <span className={`text-[9px] font-bold px-1 rounded ${v.is_heated ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
                    title={v.is_heated ? 'Термокузов: 0.35°C/мин' : 'Обычный кузов: 0.7°C/мин'}>
                {v.is_heated ? '🔥' : '❄'}
              </span>
            )}
          </span>
          <button onClick={() => onRemove(v.id)} className="text-gray-300 hover:text-red-500 text-xs shrink-0">✕</button>
        </div>
      ))}
      {available.length > 0 && (
        <select value="" onChange={e => {
          if (!e.target.value) return;
          const f = pool.find(v => v.id === parseInt(e.target.value));
          if (f) onAdd(f);
          e.currentTarget.value = '';
        }}
          className="w-full text-xs border border-dashed border-gray-300 rounded-md px-2 py-1 text-gray-500 bg-white focus:outline-none focus:border-orange-400 cursor-pointer">
          <option value="">+ добавить {VEHICLE_TYPES.find(t => t.type === type)?.label.toLowerCase()}</option>
          {available.map(v => <option key={v.id} value={v.id}>{v.name}{v.type === 'dump_truck' && v.is_heated ? ' 🔥' : ''}</option>)}
        </select>
      )}
      {available.length === 0 && selected.length === 0 && (
        <p className="text-xs text-gray-400 italic px-1">Нет доступной техники</p>
      )}
    </div>
  );
}

export default function PanelRoad({ road, onClose, polyEdit, onStartPolyEdit, onUndoPolyEdit, onFinishPolyEdit, onCancelPolyEdit, onShowMaintenance, onStartPaving, pavingActive }: Props) {
  const [mode, setMode] = useState<Mode>('road');
  const [checkedLanes, setCheckedLanes] = useState<Set<number>>(new Set());
  const [showWeather, setShowWeather] = useState(false);
  const [showGreenWindow, setShowGreenWindow] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  const [greenWindows, setGreenWindows] = useState<GreenWindow | null>(null);
  const [allVehicles, setAllVehicles] = useState<Partial<Record<VehicleType, VehicleSummary[]>>>({});
  const [selectedVehicles, setSelectedVehicles] = useState<Record<VehicleType, VehicleSummary[]>>({
    dump_truck: [], transfer_machine: [], paver: [], roller: [], closure_vehicle: [],
  });
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);
  const [showVehicles, setShowVehicles] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [logistics, setLogistics] = useState<LogisticsPlan | null>(null);
  const [loadOverride, setLoadOverride] = useState<number | null>(null);

  const totalLanes = road.lanes.length;
  const selectedCount = mode === 'road' ? totalLanes : checkedLanes.size;
  const lanesShare = totalLanes > 0 ? selectedCount / totalLanes : 1;
  const scaledHours = Math.round(road.repair_hours * lanesShare);
  const scaledDays = Math.ceil(scaledHours / 24);

  // Load green windows
  useEffect(() => {
    getGreenWindow(road.id)
      .then(setGreenWindows)
      .catch(() => setGreenWindows({ site_id: road.id, site_name: road.name, date: '', slots: [], order_deadline: null, warnings: [], road_total_t: 0, road_area_m2: 0 }));
  }, [road.id]);

  // Load vehicles + plan suggestion
  useEffect(() => {
    const firstLane = road.lanes[0]?.id ?? 1;
    Promise.all([createPlan({ road_id: road.id, lane_id: firstLane }), getVehicles()])
      .then(([plan, vehicles]) => {
        const byType: Partial<Record<VehicleType, VehicleSummary[]>> = {};
        vehicles.forEach(v => { byType[v.type] = [...(byType[v.type] ?? []), v]; });
        setAllVehicles(byType);
        const sv = plan.suggested_vehicles ?? {};
        setSelectedVehicles({
          dump_truck:       sv.dump_truck       ?? (byType.dump_truck       ?? []).slice(0, plan.dump_trucks ?? 2),
          transfer_machine: sv.transfer_machine ?? (byType.transfer_machine ?? []).slice(0, 1),
          paver:            sv.paver            ?? (byType.paver            ?? []).slice(0, 1),
          roller:           sv.roller           ?? (byType.roller           ?? []).slice(0, 2),
          closure_vehicle:  sv.closure_vehicle  ?? [],
        });
      })
      .catch(() => {});
  }, [road.id]);

  const toggleLane = (id: number) => {
    setCheckedLanes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addVehicle = (type: VehicleType, v: VehicleSummary) =>
    setSelectedVehicles(s => ({ ...s, [type]: [...s[type], v] }));
  const removeVehicle = (type: VehicleType, id: number) =>
    setSelectedVehicles(s => ({ ...s, [type]: s[type].filter(v => v.id !== id) }));

  const totalVehicles = useMemo(() => Object.values(selectedVehicles).reduce((n, arr) => n + arr.length, 0), [selectedVehicles]);

  const handleStart = () => {
    const vehicleIds = Object.values(selectedVehicles).flat().map(v => v.id);
    const laneNums = mode === 'road' ? [] : Array.from(checkedLanes);
    onStartPaving(laneNums, vehicleIds, loadOverride ?? undefined);
  };

  const handleAutoBrigade = async () => {
    setAutoLoading(true);
    try {
      const data = await autoBrigade(road.id);
      const pool = allVehicles;
      const next: Record<VehicleType, VehicleSummary[]> = {
        dump_truck: [], transfer_machine: [], paver: [], roller: [], closure_vehicle: [],
      };
      for (const bv of data.vehicles) {
        const t = bv.type as VehicleType;
        const found = (pool[t] ?? []).find(v => v.id === bv.id);
        if (found) next[t].push(found);
        else next[t].push({
          id: bv.id, type: t, name: bv.name,
          coords: bv.coords ?? undefined, speed_kmh: 0,
          capacity_t: bv.capacity_t, load_t: 0,
        } as VehicleSummary);
      }
      setSelectedVehicles(next);
      setShowVehicles(true);
      if (data.logistics) {
        setLogistics(data.logistics);
        setLoadOverride(data.logistics.target_load_per_truck_t);
      }
    } catch (err) {
      console.error('autoBrigade:', err);
      alert('Не удалось подобрать технику автоматически');
    } finally {
      setAutoLoading(false);
    }
  };

  const allSelectedIds = useMemo(
    () => Object.values(selectedVehicles).flat().map(v => v.id),
    [selectedVehicles],
  );

  const canStart = !pavingActive && (mode === 'road' || checkedLanes.size > 0) && totalVehicles > 0;

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white shadow-2xl overflow-y-auto z-10 flex flex-col">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
        <div>
          <h2 className="font-bold text-gray-900 text-sm leading-tight">{road.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Участок дороги</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors">✕</button>
      </div>

      {road.photo && (
        <img src={'https://cdn.discordapp.com/attachments/1440751646526275725/1505657484080320512/3.png?ex=6a0c150d&is=6a0ac38d&hm=21c2b6ba23d2345479f98dabe91832a42c4197d61367efa4cb7a0b84662a99b8&'} alt="Фото участка дороги" className="w-full h-44 object-cover" />
      )}

      <div className="p-4 space-y-4">
        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button onClick={() => setMode('road')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'road' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            🛣️ Вся дорога
          </button>
          <button onClick={() => setMode('lanes')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'lanes' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            ↔️ Отдельные полосы
          </button>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {mode === 'lanes' ? `Выберите полосы (${checkedLanes.size} из ${totalLanes})` : 'Схема дороги'}
          </h3>
          <RoadScheme lanes={road.lanes} selectedLane={null} onSelectLane={() => {}}
            mode={mode === 'lanes' ? 'checkbox' : 'view'}
            checkedIds={checkedLanes}
            onToggleCheck={toggleLane} />
          {mode === 'lanes' && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => setCheckedLanes(new Set(road.lanes.map(l => l.id)))}
                className="flex-1 text-xs py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors">
                Выбрать все
              </button>
              <button onClick={() => setCheckedLanes(new Set())} disabled={checkedLanes.size === 0}
                className="flex-1 text-xs py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors disabled:opacity-40">
                Снять выбор
              </button>
            </div>
          )}
        </section>

        <section className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Окна для ремонта</h3>
          {greenWindows === null ? (
            <p className="text-xs text-gray-400">Загрузка...</p>
          ) : greenWindows.slots.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <span>⛔</span> Окон для ремонта нет
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {greenWindows.slots.map((s, i) => {
                const label = `${fmtTime(s.start)}–${fmtTime(s.end)}`;
                const active = selectedWindow === label;
                return (
                  <button key={i} onClick={() => setSelectedWindow(active ? null : label)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${active ? 'bg-green-500 border-green-500 text-white' : 'bg-green-100 border-green-200 text-green-800 hover:bg-green-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-white' : 'bg-green-500'}`} />{label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Расчётное время перекладки</h3>
          <p className="text-3xl font-bold text-gray-900">{scaledHours} ч</p>
          <p className="text-sm text-gray-500 mt-0.5">
            ≈ {scaledDays} {pluralDays(scaledDays)} непрерывной работы
            {mode === 'lanes' && checkedLanes.size > 0 && (
              <span className="text-gray-400"> · {checkedLanes.size}/{totalLanes} полос</span>
            )}
          </p>
        </section>

        {/* Vehicle selection — collapsible */}
        <section className="bg-gray-50 rounded-lg border border-gray-100">
          <button onClick={() => setShowVehicles(s => !s)}
            className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-100 rounded-lg transition-colors">
            <div className="text-left">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Состав бригады</h3>
              <p className="text-sm font-bold text-gray-700 mt-0.5">{totalVehicles} ед. техники</p>
            </div>
            <span className="text-gray-400">{showVehicles ? '▲' : '▼'}</span>
          </button>
          {showVehicles && (
            <div className="px-3 pb-3 space-y-2">
              <button onClick={handleAutoBrigade} disabled={autoLoading}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <span>✨</span>
                <span>{autoLoading ? 'Подбираем...' : 'Выбрать оптимальный вариант техники'}</span>
              </button>
              {VEHICLE_TYPES.map(({ type, icon, label }) => (
                <div key={type} className="bg-white rounded-md border border-gray-100 p-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{icon}</span>
                    <p className="text-xs font-semibold text-gray-700">{label}</p>
                    <span className="text-xs text-gray-400 ml-auto">{selectedVehicles[type].length} ед.</span>
                  </div>
                  <VehicleSelector type={type}
                    pool={allVehicles[type] ?? []}
                    selected={selectedVehicles[type]}
                    onAdd={v => addVehicle(type, v)}
                    onRemove={id => removeVehicle(type, id)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Order optimization */}
        {logistics && logistics.n_trucks > 0 && (
          <section className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">🎯 Заказ смеси</h3>
              {logistics.savings_t > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 px-2 py-0.5 rounded-full">
                  −{logistics.savings_t.toFixed(0)} т ({logistics.savings_pct.toFixed(0)}%)
                </span>
              )}
            </div>

            <div className="bg-white rounded-md p-2 border border-emerald-100 mb-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Рекомендация</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {(loadOverride ?? logistics.target_load_per_truck_t).toFixed(1)} <span className="text-xs font-normal text-gray-500">т / фура</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase">Всего</p>
                  <p className="text-sm font-bold text-gray-800">
                    {((loadOverride ?? logistics.target_load_per_truck_t) * logistics.n_trucks * logistics.trips_per_truck).toFixed(0)} т
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {logistics.n_trucks} ф. × {logistics.trips_per_truck} рейс. · конвейер {logistics.interval_min.toFixed(0)} мин
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-600">
                <span>Загрузка на фуру:</span>
                <span className="font-mono">
                  5 т ←→ {logistics.truck_capacity_t.toFixed(0)} т (кузов)
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={logistics.truck_capacity_t}
                step={0.5}
                value={loadOverride ?? logistics.target_load_per_truck_t}
                onChange={e => setLoadOverride(parseFloat(e.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="flex items-center justify-between text-[10px]">
                <button
                  onClick={() => setLoadOverride(logistics.target_load_per_truck_t)}
                  className="text-emerald-700 hover:text-emerald-900 underline">
                  ← сбросить на оптимум
                </button>
                <span className="text-gray-500">
                  T прибытия: <strong className={logistics.arrival_temp_c < 140 ? 'text-red-600' : 'text-emerald-700'}>
                    {logistics.arrival_temp_c.toFixed(0)}°C
                  </strong>
                </span>
              </div>
            </div>

            {logistics.bottleneck === 'temperature' && (
              <p className="text-[10px] text-amber-700 mt-1.5 font-semibold">
                ⚠ Узкое место: температура. Лишняя смесь остынет в кузове.
              </p>
            )}
            {logistics.bottleneck === 'capacity' && (
              <p className="text-[10px] text-gray-500 mt-1.5">
                Узкое место: вместимость фуры — можно везти полную загрузку.
              </p>
            )}
            {logistics.bottleneck === 'window' && (
              <p className="text-[10px] text-gray-500 mt-1.5">
                Узкое место: длительность окна.
              </p>
            )}
          </section>
        )}

        {/* Action buttons */}
        <section className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowWeather(true)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700 text-xs font-semibold transition-colors">
            <span>🌤️</span><span>Прогноз 24ч</span>
          </button>
          <button onClick={() => setShowGreenWindow(true)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 text-xs font-semibold transition-colors">
            <span>🟢</span><span>Зелёные окна</span>
          </button>
          <button onClick={() => setShowCalc(true)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition-colors">
            <span>🧮</span><span>Калькулятор</span>
          </button>
        </section>

        <button onClick={handleStart} disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white text-sm font-bold shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          <span className="text-lg">🚚</span>
          <span>
            {pavingActive
              ? 'Укладка идёт...'
              : mode === 'road'
                ? `Уложить всю дорогу (${totalLanes} ${pluralLanes(totalLanes)})`
                : checkedLanes.size === 0
                  ? 'Выберите полосы'
                  : totalVehicles === 0
                    ? 'Добавьте технику'
                    : `Уложить ${checkedLanes.size} ${pluralLanes(checkedLanes.size)}`}
          </span>
        </button>

        <section className={`rounded-lg p-3 border transition-colors ${polyEdit ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-100'}`}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Редактор полигона</h3>
          {!polyEdit ? (
            <button onClick={onStartPolyEdit}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors">
              <span>✏️</span><span>Редактировать полигон</span>
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-indigo-700 font-medium">Кликайте на карту для добавления точек</p>
              <div className="bg-white rounded-lg border border-indigo-200 p-2 max-h-36 overflow-y-auto">
                {polyEdit.points.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-2">Точек пока нет</p>
                  : <div className="space-y-0.5">
                    {polyEdit.points.map((pt, i) => (
                      <p key={i} className="text-xs font-mono text-gray-700 leading-relaxed">
                        <span className="text-indigo-400 mr-1 select-none">{i + 1}.</span>
                        [{pt[0].toFixed(6)}, {pt[1].toFixed(6)}]
                      </p>
                    ))}
                  </div>
                }
              </div>
              <div className="flex gap-2">
                <button onClick={onUndoPolyEdit} disabled={polyEdit.points.length === 0}
                  className="flex-1 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 transition-colors">
                  ↩ Отменить
                </button>
                <button onClick={onFinishPolyEdit} disabled={polyEdit.points.length < 3}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
                  📋 В консоль
                </button>
                <button onClick={onCancelPolyEdit}
                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors">
                  ✕
                </button>
              </div>
              {polyEdit.points.length >= 3 && (
                <p className="text-xs text-indigo-500 text-center">Готово — {polyEdit.points.length} точек расставлено</p>
              )}
            </div>
          )}
        </section>
      </div>

      {showWeather && <WeatherPanel roadId={road.id} roadName={road.name} onClose={() => setShowWeather(false)} />}
      {showGreenWindow && <GreenWindowPanel roadId={road.id} roadName={road.name} vehicleIds={allSelectedIds} onClose={() => setShowGreenWindow(false)} />}
      {showCalc && <CalculatorPanel roadId={road.id} roadName={road.name} layerType={road.layer_type} onClose={() => setShowCalc(false)} />}
    </div>
  );
}

export type { Lane };
