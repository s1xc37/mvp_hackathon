import { useState } from 'react';
import { scheduleMaintenance } from '@/api/maintenance';
import type { MaintenanceTask } from '@/types/maintenance';
import type { Road } from '@/types/road';

interface Props {
  roads: Road[];
  onClose: () => void;
}

const PRIORITY_STYLE: Record<string, string> = {
  high:   'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low:    'bg-green-100 text-green-800 border-green-200',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

function formatDt(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, '0');
    const mon = (d.getMonth() + 1).toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${day}.${mon} ${h}:${m}`;
  } catch {
    return iso;
  }
}

export default function MaintenancePanel({ roads, onClose }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const toggle = (id: string) =>
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleSchedule = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const r = await scheduleMaintenance({ site_ids: selectedIds });
      setTasks(r.tasks);
      setDone(true);
    } catch {
      setError('Ошибка формирования плана ТО');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-amber-600 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-amber-100 text-xs uppercase tracking-wider">Техническое обслуживание</p>
            <h3 className="text-white font-bold text-base mt-0.5">Планирование ТО</h3>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-700 transition-colors shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {!done ? (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Выберите участки</p>
                <div className="space-y-1.5">
                  {roads.map(r => {
                    const sel = selectedIds.includes(r.id);
                    return (
                      <button key={r.id} onClick={() => toggle(r.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${sel ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200 hover:border-amber-200'}`}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                          <p className="text-xs text-gray-400">Ремонт: {r.repair_hours} ч</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Сформированный план ({tasks.length} задач)</p>
              {tasks.map((t, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{t.task_type}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${PRIORITY_STYLE[t.priority] ?? 'bg-gray-100 text-gray-700'}`}>
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{t.description}</p>
                  <p className="text-xs text-gray-400 mt-1">Запланировано: {formatDt(t.scheduled_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 shrink-0 border-t border-gray-100">
          {!done ? (
            <button onClick={handleSchedule} disabled={loading || selectedIds.length === 0}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? <span>Формирование...</span> : <><span>🔧</span><span>Сформировать план ТО ({selectedIds.length})</span></>}
            </button>
          ) : (
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-bold text-sm transition-colors">Закрыть</button>
          )}
        </div>
      </div>
    </div>
  );
}
