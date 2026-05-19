import { useSimClock } from '@/sim/SimClock';
import { useForecast } from '@/sim/useForecast';
import type { PavingSpeed } from '@/types/paving';

const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const SPEED_OPTIONS: PavingSpeed[] = [1, 10, 100, 1000];

function weatherIcon(desc: string, precip: boolean, temp: number): string {
  if (precip) return temp < 0 ? '❄️' : '🌧️';
  const d = desc.toLowerCase();
  if (d.includes('ясно') || d.includes('clear')) return '☀️';
  if (d.includes('облач') || d.includes('overcast')) return '☁️';
  if (d.includes('туман') || d.includes('fog')) return '🌫️';
  return '🌤️';
}

interface Props {
  lat: number;
  lon: number;
  locationName?: string;
}

export default function MapTimeline({ lat, lon, locationName }: Props) {
  const { simNow, speed, setSpeed, isRunning, pause, resume, weatherOverride, setWeatherOverride } = useSimClock();
  const { pointAt } = useForecast(lat, lon);

  const weather = pointAt(simNow);

  const msk = new Date(simNow.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const day = RU_DAYS[msk.getDay()];
  const dateStr = `${msk.getDate()} ${RU_MONTHS[msk.getMonth()]} ${msk.getFullYear()}`;
  const time = simNow.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow',
  });

  const suitable = weather && !weather.has_precipitation && weather.temp_c >= 5 && weather.wind_ms <= 5;
  const isMagic = weatherOverride !== 'auto';

  const toggleGood = () => setWeatherOverride(weatherOverride === 'good' ? 'auto' : 'good');
  const toggleBad  = () => setWeatherOverride(weatherOverride === 'bad'  ? 'auto' : 'bad');

  return (
    <div className="absolute bottom-4 left-4 z-20 select-none">
      <div className="bg-black/70 backdrop-blur-sm text-white rounded-2xl px-4 py-3 min-w-[230px] shadow-2xl border border-white/10">

        {/* Clock */}
        <div className="mb-1.5">
          <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">{day}, {dateStr}</div>
          <div className="text-3xl font-mono font-bold leading-none tracking-tight">{time}</div>
          {locationName && (
            <div className="text-[10px] text-white/50 mt-1 truncate max-w-[200px]">📍 {locationName}</div>
          )}
        </div>

        {/* Speed controls */}
        <div className="border-t border-white/10 pt-2 mt-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Скорость времени</span>
            <button
              onClick={isRunning ? pause : resume}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            >
              {isRunning ? '⏸ Пауза' : '▶ Старт'}
            </button>
          </div>
          <div className="flex gap-1">
            {SPEED_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setSpeed(opt)}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border transition-colors ${
                  speed === opt
                    ? 'bg-white text-gray-900 border-white'
                    : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
                }`}>
                ×{opt}
              </button>
            ))}
          </div>
        </div>

        {/* Weather */}
        <div className="border-t border-white/10 pt-2 mt-2">
          {!weather ? (
            <div className="text-[10px] text-white/40 italic animate-pulse">Загрузка погоды...</div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{weatherIcon(weather.description, weather.has_precipitation, weather.temp_c)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold leading-none">
                    {weather.temp_c > 0 ? '+' : ''}{weather.temp_c.toFixed(1)}°C
                  </div>
                  <div className="text-[10px] text-white/60 leading-none mt-0.5 truncate">{weather.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-white/50">💨</span>
                  <span className="text-[11px] font-semibold">{weather.wind_ms.toFixed(1)} м/с</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-white/50">💧</span>
                  <span className="text-[11px] font-semibold">{weather.humidity_pct}%</span>
                </div>
                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${suitable ? 'bg-green-500/80 text-white' : 'bg-red-500/70 text-white'}`}>
                  {suitable ? '✓ Годно' : '✕ Нет'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Magic weather */}
        <div className="border-t border-white/10 pt-2 mt-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Магия погоды</span>
            {isMagic && (
              <button onClick={() => setWeatherOverride('auto')}
                className="text-[10px] text-white/50 hover:text-white/90 underline">
                сбросить
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <button onClick={toggleGood}
              className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border transition-colors ${
                weatherOverride === 'good'
                  ? 'bg-green-500 border-green-400 text-white'
                  : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
              }`}>
              ☀️ Годно
            </button>
            <button onClick={toggleBad}
              className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border transition-colors ${
                weatherOverride === 'bad'
                  ? 'bg-red-500 border-red-400 text-white'
                  : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
              }`}>
              ⛈️ Шторм
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
