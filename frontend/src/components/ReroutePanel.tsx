import { useState } from 'react';
import { rerouteTrucks } from '@/api/logistics';
import type { RerouteOption } from '@/types/reroute';
import type { Road } from '@/types/road';

interface Props {
  roads: Road[];
  onClose: () => void;
}

export default function ReroutePanel({ roads, onClose }: Props) {
  const [blockedId, setBlockedId] = useState('');
  const [tonnage, setTonnage] = useState(20);
  const [options, setOptions] = useState<RerouteOption[]>([]);
  const [recommendation, setRecommendation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReroute = async () => {
    if (!blockedId) return;
    setLoading(true);
    setError('');
    try {
      const r = await rerouteTrucks({ blocked_site_id: blockedId, available_tonnage_t: tonnage });
      setOptions(r.options);
      setRecommendation(r.recommendation);
    } catch {
      setError('Ошибка расчёта маршрута');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-indigo-600 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-indigo-100 text-xs uppercase tracking-wider">Перенаправление техники</p>
            <h3 className="text-white font-bold text-base mt-0.5">Выбор альтернативного участка</h3>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-indigo-700 transition-colors shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Заблокированный участок</label>
            <select value={blockedId} onChange={e => { setBlockedId(e.target.value); setOptions([]); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Выберите участок...</option>
              {roads.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Свободный тоннаж (т)</label>
            <input type="number" min={1} max={200} value={tonnage} onChange={e => setTonnage(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          {options.length > 0 && (
            <div className="space-y-3">
              {recommendation && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-1">Рекомендация</p>
                  <p className="text-sm text-indigo-900">{recommendation}</p>
                </div>
              )}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Альтернативы</p>
              {options.map((opt, i) => (
                <div key={i} className={`rounded-xl border p-3 ${opt.has_green_window ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-bold text-gray-900">{opt.site_name}</p>
                    {opt.has_green_window
                      ? <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-800 rounded-full border border-green-200 shrink-0">Окно есть</span>
                      : <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border border-gray-200 shrink-0">Нет окна</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <div>
                      <p className="text-gray-400">Расстояние</p>
                      <p className="font-semibold text-gray-800">{opt.distance_km.toFixed(1)} км</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Доп. время</p>
                      <p className="font-semibold text-gray-800">+{opt.extra_time_min} мин</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Рек. тоннаж</p>
                      <p className="font-semibold text-gray-800">{opt.recommended_tonnage_t.toFixed(1)} т</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 shrink-0 border-t border-gray-100">
          <button onClick={handleReroute} disabled={loading || !blockedId}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
            {loading ? <span>Расчёт...</span> : <><span>🔀</span><span>Найти альтернативы</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
