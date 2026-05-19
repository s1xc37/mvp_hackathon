import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import type { Condition } from '@/types/road';
import PlanPanel from './PlanPanel';

interface LaneRow {
  id: number;
  name: string;
  road_id: string;
  road_name: string;
  condition: Condition;
  last_paved: string;
  direction: string;
  repair_hours: number;
  weather_windows: string[];
}

const CONDITION_ORDER: Record<Condition, number> = { 'Критическое': 0, 'Плохое': 1, 'Удовлетворительное': 2, 'Хорошее': 3 };

const CONDITION_BADGE: Record<Condition, string> = {
  'Хорошее':            'bg-green-100 text-green-800 border-green-200',
  'Удовлетворительное': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Плохое':             'bg-orange-100 text-orange-800 border-orange-200',
  'Критическое':        'bg-red-100 text-red-800 border-red-200',
};

const COND_DOT: Record<Condition, string> = {
  'Хорошее': 'bg-green-500', 'Удовлетворительное': 'bg-yellow-500',
  'Плохое': 'bg-orange-500', 'Критическое': 'bg-red-500',
};

const COLUMNS = [
  { key: 'name',             label: 'Участок / Полоса' },
  { key: 'condition',        label: 'Состояние' },
  { key: 'last_paved',       label: 'Последний ремонт' },
  //{ key: 'weather_suitable', label: 'Окна для ремонта' },
] as const;

type SortKey = typeof COLUMNS[number]['key'];

function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function daysSince(iso: string): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function pluralDays(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 19) return 'дней';
  const r = n % 10;
  if (r === 1) return 'день';
  if (r >= 2 && r <= 4) return 'дня';
  return 'дней';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-gray-300">⇅</span>;
  return <span className="ml-1 text-blue-500">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function sortLanes(lanes: LaneRow[], key: SortKey, dir: 'asc' | 'desc'): LaneRow[] {
  return [...lanes].sort((a, b) => {
    let va: number | string, vb: number | string;
    if (key === 'condition') {
      va = CONDITION_ORDER[a.condition] ?? 99;
      vb = CONDITION_ORDER[b.condition] ?? 99;
    } else if (key === 'last_paved') {
      va = new Date(a.last_paved).getTime();
      vb = new Date(b.last_paved).getTime();
    // } else if (key === 'weather_suitable') {
    //   va = a.weather_windows?.length ?? 0;
    //   vb = b.weather_windows?.length ?? 0;
    } else {
      va = `${(a.road_name ?? '').toLowerCase()}\x00${(a.name ?? '').toLowerCase()}`;
      vb = `${(b.road_name ?? '').toLowerCase()}\x00${(b.name ?? '').toLowerCase()}`;
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

interface Props { onClose: () => void }

export default function LineInformation({ onClose }: Props) {
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'condition', dir: 'asc' });
  const [filter, setFilter] = useState('');
  const [planTarget, setPlanTarget] = useState<{ road: { id: string; name: string; repair_hours: number; weather_windows: string[] }; lane: { id: number; name: string } } | null>(null);

  useEffect(() => {
    api.get<LaneRow[]>('/lanes')
      .then(r => setLanes(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const displayed = useMemo(() => {
    const q = filter.toLowerCase();
    const filtered = q
      ? lanes.filter(l => l.name.toLowerCase().includes(q) || l.road_name.toLowerCase().includes(q) || l.condition.toLowerCase().includes(q))
      : lanes;
    return sortLanes(filtered, sort.key, sort.dir);
  }, [lanes, sort, filter]);

  return (
    <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl max-h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Все полосы движения</h2>
            <p className="text-xs text-gray-400 mt-0.5">{loading ? 'Загрузка...' : `${displayed.length} из ${lanes.length} полос`}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input type="text" placeholder="Поиск..." value={filter} onChange={e => setFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 w-44" />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">✕</button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Загрузка данных...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="w-6 px-4 py-3 text-left text-xs font-semibold text-gray-400">#</th>
                  {COLUMNS.map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900 hover:bg-gray-100 transition-colors select-none whitespace-nowrap">
                      {col.label}<SortIcon active={sort.key === col.key} dir={sort.dir} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Действие</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400">Ничего не найдено</td></tr>
                )}
                {displayed.map((lane, i) => {
                  const days = daysSince(lane.last_paved);
                  return (
                    <tr key={`${lane.road_id}-${lane.id}`} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-300 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm">{lane.road_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{lane.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${CONDITION_BADGE[lane.condition] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {lane.condition}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium text-gray-800">{formatDate(lane.last_paved)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{days} {pluralDays(days)} назад</p>
                      </td>
                      <td className="px-4 py-3">
                        {lane.weather_windows?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {lane.weather_windows.map((w, wi) => (
                              <span key={wi} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{w}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-red-500">Нет действий</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lane.weather_windows?.length > 0 ? (
                          <button onClick={() => setPlanTarget({ road: { id: lane.road_id, name: lane.road_name, repair_hours: lane.repair_hours, weather_windows: lane.weather_windows ?? [] }, lane: { id: lane.id, name: lane.name } })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors whitespace-nowrap">
                            <span>🚜</span><span>Начать ремонт</span>
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && lanes.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex gap-4 text-xs text-gray-500 flex-wrap">
            {(['Критическое', 'Плохое', 'Удовлетворительное', 'Хорошее'] as Condition[]).map(cond => {
              const count = lanes.filter(l => l.condition === cond).length;
              return (
                <span key={cond} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${COND_DOT[cond]}`} />
                  {cond}: <strong>{count}</strong>
                </span>
              );
            })}
            <span className="ml-auto flex items-center gap-1">
              Доступно для ремонта: <strong className="text-green-700">{lanes.filter(l => l.weather_windows?.length > 0).length}</strong>
            </span>
          </div>
        )}
      </div>

      {planTarget && (
        <PlanPanel road={planTarget.road} lane={planTarget.lane}
          onClose={() => setPlanTarget(null)}
          onDone={() => { setPlanTarget(null); onClose(); }} />
      )}
    </div>
  );
}
