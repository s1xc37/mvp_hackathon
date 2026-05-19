import type { WeatherPoint } from '@/types/weather';

export const MIN_TEMP_STANDARD = 5;
export const MIN_TEMP_THIN = 10;
export const MAX_WIND_SPEED = 5;

export function isPointSuitable(p: WeatherPoint, layer: 'standard' | 'thin'): boolean {
  const minTemp = layer === 'thin' ? MIN_TEMP_THIN : MIN_TEMP_STANDARD;
  return p.temp_c >= minTemp && p.wind_ms <= MAX_WIND_SPEED && !p.has_precipitation;
}
