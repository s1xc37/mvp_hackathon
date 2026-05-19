import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { WeatherPoint } from '@/types/weather';
import { isPointSuitable } from './weatherRules';
import { useSimClock } from './SimClock';

const SYNTHETIC_GOOD: Omit<WeatherPoint, 'time'> = {
  temp_c: 22, feels_like_c: 22, wind_ms: 1.5, wind_gust_ms: 2,
  precip_mm: 0, precip_probability: 0, humidity_pct: 45, pressure_hpa: 1015,
  cloudiness_pct: 10, description: 'Ясно (магия ✨)', has_precipitation: false,
};

const SYNTHETIC_BAD: Omit<WeatherPoint, 'time'> = {
  temp_c: 2, feels_like_c: 0, wind_ms: 12, wind_gust_ms: 15,
  precip_mm: 5, precip_probability: 95, humidity_pct: 95, pressure_hpa: 998,
  cloudiness_pct: 100, description: 'Сильный дождь (магия ⛈️)', has_precipitation: true,
};

export function useForecast(lat: number, lon: number) {
  const [points, setPoints] = useState<WeatherPoint[]>([]);
  const { weatherOverride } = useSimClock();

  useEffect(() => {
    api.get('/weather/point', { params: { lat, lon, hours: 48 } })
      .then(r => setPoints(r.data.points ?? []))
      .catch(() => setPoints([]));
  }, [lat, lon]);

  const pointAt = (t: Date): WeatherPoint | null => {
    if (weatherOverride === 'good') return { ...SYNTHETIC_GOOD, time: t.toISOString() };
    if (weatherOverride === 'bad')  return { ...SYNTHETIC_BAD,  time: t.toISOString() };
    if (points.length === 0) return null;
    const target = t.getTime();
    let best = points[0];
    let bestDiff = Math.abs(new Date(best.time).getTime() - target);
    for (const p of points) {
      const diff = Math.abs(new Date(p.time).getTime() - target);
      if (diff < bestDiff) { best = p; bestDiff = diff; }
    }
    return best;
  };

  const isSuitable = (t: Date, layer: 'standard' | 'thin'): boolean => {
    if (weatherOverride === 'good') return true;
    if (weatherOverride === 'bad')  return false;
    const p = pointAt(t);
    return p ? isPointSuitable(p, layer) : true;
  };

  return { points, pointAt, isSuitable };
}
