import { useState, useEffect } from 'react';
import { getWeather } from '@/api/weather';
import type { WeatherPoint } from '@/types/weather';

interface Props {
  roadId: string;
  roadName: string;
  onClose: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow',
  });
}

function WindBar({ ms }: { ms: number }) {
  const max = 15;
  const pct = Math.min(100, (ms / max) * 100);
  const color = ms > 5 ? 'bg-red-400' : ms > 3 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 tabular-nums">{ms.toFixed(1)}</span>
    </div>
  );
}

export default function WeatherPanel({ roadId, roadName, onClose }: Props) {
  const [points, setPoints] = useState<WeatherPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getWeather(roadId, 24)
      .then(f => setPoints(f.points))
      .catch(() => setError('Не удалось загрузить прогноз'))
      .finally(() => setLoading(false));
  }, [roadId]);

  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col h-[85vh] overflow-hidden">
        <div className="bg-sky-600 px-5 py-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-sky-100 text-xs uppercase tracking-wider">Прогноз погоды · 24 ч</p>
            <h3 className="text-white font-bold text-base mt-0.5 truncate">{roadName}</h3>
          </div>
          <button onClick={onClose} className="text-sky-200 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-sky-700 transition-colors shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading && <div className="py-16 text-center text-gray-400">Загрузка прогноза...</div>}
          {error && <div className="py-16 text-center text-red-500">{error}</div>}
          {!loading && !error && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                <tr className="border-b border-gray-200">
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">Время</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">°C</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">Ветер</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">Осадки</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">Влаж.</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500">Годно</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => {
                  const ok = !p.has_precipitation && p.temp_c >= 5 && p.wind_ms <= 5;
                  return (
                    <tr key={i} className={`border-b border-gray-50 ${ok ? 'hover:bg-green-50' : 'hover:bg-red-50'}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <p className="text-[10px] text-gray-400 leading-tight">{formatDateShort(p.time)}</p>
                        <p className="font-mono font-semibold text-gray-800 text-xs leading-tight">{formatTime(p.time)}</p>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`text-xs font-semibold ${p.temp_c < 5 ? 'text-red-600' : p.temp_c < 10 ? 'text-yellow-600' : 'text-green-700'}`}>
                          {p.temp_c > 0 ? '+' : ''}{p.temp_c.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5"><WindBar ms={p.wind_ms} /></td>
                      <td className="px-2 py-1.5">
                        {p.has_precipitation
                          ? <span className="text-xs font-semibold text-red-600">⛔ {p.precip_mm.toFixed(1)}мм</span>
                          : <span className="text-xs text-green-600">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{p.humidity_pct}%</td>
                      <td className="px-2 py-1.5">
                        {ok
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">✓</span>
                          : <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">✕</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 shrink-0 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">Критерии: t ≥ 5°C, ветер ≤ 5 м/с, без осадков</p>
          <p className="text-[11px] text-gray-400 font-semibold">{points.length} ч</p>
        </div>
      </div>
    </div>
  );
}
