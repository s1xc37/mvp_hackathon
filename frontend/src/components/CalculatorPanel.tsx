import { useState } from 'react';
import { calcBeforeRain } from '@/api/calculator';
import type { CalcResponse } from '@/types/calculator';

interface Props {
  roadId: string;
  roadName: string;
  layerType: 'standard' | 'thin';
  onClose: () => void;
}

export default function CalculatorPanel({ roadId, roadName, layerType, onClose }: Props) {
  const [timeToRain, setTimeToRain] = useState(90);
  const [mixTemp, setMixTemp] = useState(150);
  const [paverWidth, setPaverWidth] = useState(3.75);
  const [result, setResult] = useState<CalcResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalc = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await calcBeforeRain({ site_id: roadId, time_to_rain_min: timeToRain, mix_temp_c: mixTemp, paver_width_m: paverWidth, layer_type: layerType });
      setResult(r);
    } catch {
      setError('Ошибка расчёта');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-purple-600 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-purple-100 text-xs uppercase tracking-wider">Калькулятор · Успеть до дождя</p>
            <h3 className="text-white font-bold text-base mt-0.5">{roadName}</h3>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-700 transition-colors shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">До дождя (мин)</label>
            <input type="number" min={10} max={480} value={timeToRain} onChange={e => setTimeToRain(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Температура смеси (°C)</label>
            <input type="number" min={100} max={200} value={mixTemp} onChange={e => setMixTemp(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Ширина укладки (м)</label>
            <input type="number" min={1} max={10} step={0.25} value={paverWidth} onChange={e => setPaverWidth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            <p className="text-xs text-gray-400">Тип слоя: <strong className="text-gray-700">{layerType === 'thin' ? 'Тонкий' : 'Стандартный'}</strong></p>
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          {result && (
            <div className={`rounded-xl p-4 border ${result.can_start ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm font-bold mb-3 flex items-center gap-2">
                {result.can_start ? <><span>✅</span><span className="text-green-800">Можно начинать</span></> : <><span>🚫</span><span className="text-red-800">Не рекомендуется</span></>}
              </p>
              <div className="space-y-1.5 text-xs text-gray-700">
                <p>Время уплотнения: <strong>{result.compaction_time_min} мин</strong></p>
                <p>Доступно для укладки: <strong>{result.available_paving_min} мин</strong></p>
                <p>Макс. тоннаж: <strong>{result.max_tonnage_t.toFixed(1)} т</strong></p>
                <p>Самосвалов: <strong>{result.trucks_needed} шт.</strong></p>
              </div>
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">{result.recommendation}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 shrink-0 border-t border-gray-100">
          <button onClick={handleCalc} disabled={loading}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
            {loading ? <span>Расчёт...</span> : <><span>🧮</span><span>Рассчитать</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
