import { useState, useEffect } from 'react';
import { getGreenWindow } from '@/api/greenWindow';
import { useSimClock } from '@/sim/SimClock';
import type { GreenWindow, TimeSlot, PrepInfo, BrigadeMember } from '@/types/greenWindow';
import { fmtTime } from '@/utils/time';
import { computeEffectiveSlot, fmtMin } from '@/utils/slotMath';

interface Props {
  roadId: string;
  roadName: string;
  vehicleIds?: number[];
  onClose: () => void;
}

const VEHICLE_ICON: Record<string, string> = {
  dump_truck: '🚚',
  transfer_machine: '🚛',
  paver: '🚜',
  roller: '🛞',
  closure_vehicle: '🚙',
};
const VEHICLE_LABEL: Record<string, string> = {
  dump_truck: 'Самосвал',
  transfer_machine: 'Перегружатель',
  paver: 'Укладчик',
  roller: 'Каток',
  closure_vehicle: 'Машина прикрытия',
};

const BOTTLENECK_LABEL: Record<string, string> = {
  paver: 'Производительность укладчика',
  demand: 'Объём дороги',
  plant: 'Мощность АБЗ',
  delivery: 'Доставка фурами',
};

function PrepTimeline({ start, prep }: { start: Date; prep: PrepInfo }) {
  // Подготовка: 3 сегмента. start — момент реального начала подготовки.
  const segments = [
    { label: 'К АБЗ', min: prep.to_plant_min, color: 'bg-sky-300', icon: '🚚' },
    { label: 'Загрузка', min: prep.load_min, color: 'bg-amber-300', icon: '⛽' },
    { label: 'Доставка', min: prep.delivery_min, color: 'bg-orange-300', icon: '🚛' },
  ];
  let cursor = start;
  const rows = segments.map(seg => {
    const segStart = cursor;
    const segEnd = new Date(segStart.getTime() + seg.min * 60000);
    cursor = segEnd;
    return { ...seg, segStart, segEnd };
  });
  const total = prep.total_min;
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {rows.map((r, i) => (
          <div key={i} className={r.color} style={{ width: `${(r.min / total) * 100}%` }} title={r.label} />
        ))}
      </div>
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <span>{r.icon}</span>
            <span className="font-mono text-gray-600">{fmtTime(r.segStart.toISOString())}–{fmtTime(r.segEnd.toISOString())}</span>
            <span className="text-gray-500">{r.label}</span>
            <span className="text-gray-400 ml-auto">{fmtMin(r.min)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EffectivePanel({
  slot, prep, roadTotalT,
}: { slot: TimeSlot; prep: PrepInfo | undefined; roadTotalT: number }) {
  const { simNow } = useSimClock();
  if (!prep) return null;
  const eff = computeEffectiveSlot(simNow, slot, prep, roadTotalT);

  if (eff.status === 'expired') {
    return (
      <div className="mt-2 rounded-lg bg-gray-100 border border-gray-200 p-2 text-center">
        <p className="text-xs font-bold text-gray-500">❌ Окно прошло — {fmtTime(slot.end)}</p>
      </div>
    );
  }
  if (eff.status === 'lost') {
    return (
      <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2 text-center">
        <p className="text-xs font-bold text-red-700">❌ Не успеем — подготовка кончится позже окна</p>
        <p className="text-[10px] text-red-500 mt-0.5">Опоздание {fmtMin(eff.delayMin)}</p>
      </div>
    );
  }

  const pct = Math.round(eff.roadPct * 100);
  const banner = eff.status === 'tight'
    ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: '⏰', label: `Опоздание ${fmtMin(eff.delayMin)} — старт укладки сдвинут на ${fmtTime(eff.pavingStart.toISOString())}` }
    : eff.status === 'paving_now'
      ? { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', icon: '🟢', label: 'Укладка идёт сейчас' }
      : eff.status === 'preparing'
        ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: '🟡', label: 'Идёт подготовка' }
        : null;

  return (
    <div className="mt-2 space-y-2">
      {banner && (
        <div className={`rounded-lg ${banner.bg} border p-1.5 text-[11px] font-semibold ${banner.text} flex items-center gap-1.5`}>
          <span>{banner.icon}</span><span>{banner.label}</span>
        </div>
      )}

      <div className="rounded-lg bg-white border border-gray-200 p-2.5 space-y-2">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Подготовка</p>
          <PrepTimeline start={eff.prepStart} prep={prep} />
        </div>

        <div className="border-t border-gray-100 pt-2">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Укладка</p>
            <p className="text-[10px] font-mono text-gray-500">
              {fmtTime(eff.pavingStart.toISOString())}–{fmtTime(eff.pavingEnd.toISOString())} · {fmtMin(eff.pavingMin)}
            </p>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xl font-bold text-gray-900">{eff.tonnage.toFixed(1)} <span className="text-sm font-semibold text-gray-500">т</span></p>
              <p className="text-[10px] text-gray-400">≈ {pct}% дороги ({roadTotalT.toFixed(0)} т всего)</p>
            </div>
            <div className="text-right">
              <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${pct}%` }} />
              </div>
              {eff.lostMin > 0 && (
                <p className="text-[9px] text-red-500 font-semibold mt-1">
                  −{eff.lostTonnage.toFixed(1)} т ({fmtMin(eff.lostMin)} упущено)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotCard({ slot, prep, roadTotalT }: { slot: TimeSlot; prep: PrepInfo | undefined; roadTotalT: number }) {
  const h = Math.floor(slot.duration_min / 60);
  const m = slot.duration_min % 60;
  const dur = h > 0 ? `${h} ч${m > 0 ? ` ${m} мин` : ''}` : `${m} мин`;
  return (
    <div className={`rounded-xl p-4 border ${slot.is_optimal ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-1.5">
        {slot.is_optimal
          ? <span className="text-xs font-bold px-2 py-0.5 bg-green-500 text-white rounded-full">Оптимально</span>
          : <span />}
        <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full shrink-0">{dur}</span>
      </div>

      <div className="flex items-stretch gap-0 mb-2 rounded-lg overflow-hidden border border-amber-300">
        <div className="bg-amber-200 px-2 py-1.5 flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-900 leading-none">🟡 Подготовка</p>
          <p className="text-xs font-mono font-semibold text-amber-900 mt-0.5">
            {fmtTime(slot.yellow_start)} – {fmtTime(slot.start)}
          </p>
        </div>
        <div className="bg-green-200 px-2 py-1.5 flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-green-900 leading-none">🟢 Укладка</p>
          <p className="text-xs font-mono font-semibold text-green-900 mt-0.5">
            {fmtTime(slot.start)} – {fmtTime(slot.end)}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-1">{slot.start.slice(0, 10)}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-2 mb-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Оптимальный заказ</p>
          <p className="text-[10px] text-gray-400">потенциал: {slot.max_tonnage_t.toFixed(0)} т</p>
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{slot.optimal_tonnage_t.toFixed(1)} <span className="text-sm text-gray-500">т</span></p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Узкое место: <strong className="text-gray-700">{BOTTLENECK_LABEL[slot.bottleneck]}</strong>
        </p>
      </div>

      <EffectivePanel slot={slot} prep={prep} roadTotalT={roadTotalT} />
    </div>
  );
}

function BrigadeRow({ m }: { m: BrigadeMember }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 bg-white rounded-md border border-gray-100">
      <span className="text-base shrink-0">{VEHICLE_ICON[m.type] ?? '🚗'}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate flex items-center gap-1">
          {m.name}
          {m.is_heated && (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded" title="Термокузов с подогревом">🔥</span>
          )}
        </p>
        <p className="text-[10px] text-gray-400">{VEHICLE_LABEL[m.type] ?? m.type}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-gray-500 font-mono">{m.to_plant_km.toFixed(1)} км</p>
        <p className="text-xs font-bold text-gray-700">{fmtMin(m.to_plant_min)}</p>
      </div>
    </div>
  );
}

export default function GreenWindowPanel({ roadId, roadName, vehicleIds, onClose }: Props) {
  const [data, setData] = useState<GreenWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const hasIds = vehicleIds && vehicleIds.length > 0;
    getGreenWindow(roadId, { vehicleIds, auto: !hasIds })
      .then(setData)
      .catch(() => setError('Не удалось загрузить окна'))
      .finally(() => setLoading(false));
  }, [roadId, vehicleIds?.join(',')]);

  const prep = data?.prep;
  const brigade = data?.brigade ?? [];
  const roadTotalT = data?.road_total_t ?? 0;

  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-green-600 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-green-100 text-xs uppercase tracking-wider">Зелёные окна укладки</p>
            <h3 className="text-white font-bold text-base mt-0.5">{roadName}</h3>
            {data?.date && <p className="text-green-100 text-xs mt-0.5">{data.date}</p>}
          </div>
          <button onClick={onClose} className="text-green-200 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-green-700 transition-colors shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading && <div className="py-12 text-center text-gray-400">Расчёт окон...</div>}
          {error && <div className="py-12 text-center text-red-500">{error}</div>}

          {data && !loading && (
            <>
              {data.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  {data.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                      <span className="shrink-0">⚠️</span>{w}
                    </p>
                  ))}
                </div>
              )}

              {prep && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">
                      {prep.has_brigade ? '✨ Назначенная бригада' : '⏱ Подготовка (норматив)'}
                    </p>
                    {data.plant_name && (
                      <span className="text-[10px] text-indigo-700 font-semibold bg-white border border-indigo-200 rounded-full px-2 py-0.5">
                        🏭 {data.plant_name}
                      </span>
                    )}
                  </div>

                  {brigade.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {brigade.map(m => <BrigadeRow key={m.id} m={m} />)}
                    </div>
                  )}

                  <div className="bg-white rounded-lg border border-indigo-100 p-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-gray-400">К АБЗ</p>
                      <p className="text-xs font-bold text-gray-800 mt-0.5">{fmtMin(prep.to_plant_min)}</p>
                    </div>
                    <div className="border-x border-gray-100">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400">Загрузка</p>
                      <p className="text-xs font-bold text-gray-800 mt-0.5">{fmtMin(prep.load_min)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-gray-400">Доставка</p>
                      <p className="text-xs font-bold text-gray-800 mt-0.5">{fmtMin(prep.delivery_min)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-indigo-700 font-semibold">Итого подготовка:</p>
                    <p className="text-base font-bold text-indigo-900">{fmtMin(prep.total_min)}</p>
                  </div>

                  {prep.has_brigade && (
                    <div className={`mt-2 rounded-lg border p-2 ${
                      !prep.mix_usable
                        ? 'bg-red-50 border-red-300'
                        : !prep.mix_optimal
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-emerald-50 border-emerald-300'
                    }`}>
                      <div className="flex items-baseline justify-between">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-600">
                          🌡 Температура смеси
                        </p>
                        <p className={`text-base font-bold ${
                          !prep.mix_usable ? 'text-red-700'
                            : !prep.mix_optimal ? 'text-amber-700'
                              : 'text-emerald-700'
                        }`}>
                          {prep.mix_temp_arrival_c.toFixed(0)}°C
                        </p>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {prep.mix_temp_start_c.toFixed(0)}°C на АБЗ
                        {' '}→ −{(prep.cool_rate * prep.delivery_min).toFixed(0)}°C в пути ({fmtMin(prep.delivery_min)})
                        {' '}→ −{(prep.cool_rate_waiting * prep.site_wait_min).toFixed(0)}°C ожидание ({prep.site_wait_min} мин)
                      </p>
                      {!prep.mix_usable && (
                        <p className="text-[10px] text-red-700 font-semibold mt-1">
                          ❌ Ниже 140°C — нельзя начинать уплотнение по ГОСТ. Нужен АБЗ ближе или фуры с подогревом.
                        </p>
                      )}
                      {prep.mix_usable && !prep.mix_optimal && (
                        <p className="text-[10px] text-amber-700 mt-1">
                          ⚠ На грани 145°C — рекомендуется термокузов или ближний АБЗ.
                        </p>
                      )}

                      <div className="mt-1.5 pt-1.5 border-t border-gray-200 grid grid-cols-2 gap-1 text-[10px] text-gray-700">
                        <div>
                          <span className="text-gray-400">Грузить от:</span>{' '}
                          <strong className={prep.required_mix_temp_c > prep.mix_temp_start_c ? 'text-red-700' : 'text-gray-800'}>
                            {prep.required_mix_temp_c.toFixed(0)}°C
                          </strong>
                          {prep.required_mix_temp_c > prep.mix_temp_start_c && (
                            <span className="text-red-600 ml-1">⚠</span>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-400">АБЗ выдаёт:</span>{' '}
                          <strong className="text-gray-800">{prep.mix_temp_start_c.toFixed(0)}°C</strong>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600 flex-wrap">
                        <span>🔥 термо: {Math.round(prep.heated_share * 100)}%</span>
                        <span>·</span>
                        <span>в пути {prep.cool_rate.toFixed(2)} °C/мин</span>
                        <span>·</span>
                        <span>на участке {prep.cool_rate_waiting.toFixed(2)} °C/мин</span>
                        {prep.air_temp_c !== null && (
                          <>
                            <span>·</span>
                            <span>воздух {prep.air_temp_c.toFixed(0)}°C / {(prep.wind_ms ?? 0).toFixed(1)} м/с</span>
                          </>
                        )}
                      </div>

                      {prep.drying_min > 0 && (
                        <p className="text-[10px] text-blue-700 mt-1 font-semibold">
                          🌧 Просушка после дождя: +{fmtMin(prep.drying_min)} к подготовке
                        </p>
                      )}
                    </div>
                  )}

                  {roadTotalT > 0 && (
                    <p className="text-[10px] text-indigo-700 mt-2">
                      На всю дорогу нужно <strong>{roadTotalT.toFixed(0)} т</strong> асфальта ({data.road_area_m2.toFixed(0)} м²)
                    </p>
                  )}
                  {!prep.has_brigade && (
                    <p className="text-[10px] text-indigo-700 mt-1 italic">
                      Бригада не выбрана — окна посчитаны по нормативу.
                    </p>
                  )}
                </div>
              )}

              {data.order_deadline && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-800">Крайний срок заказа смеси:</p>
                  <p className="text-xl font-bold text-blue-900 font-mono mt-0.5">{fmtTime(data.order_deadline)}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{data.order_deadline.slice(0, 10)}</p>
                </div>
              )}

              {data.slots.length === 0
                ? <div className="py-8 text-center text-gray-400">Нет пригодных окон на сегодня</div>
                : data.slots.map((s, i) => <SlotCard key={i} slot={s} prep={prep} roadTotalT={roadTotalT} />)
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
